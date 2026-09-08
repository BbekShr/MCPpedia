import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'

const roleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['contributor', 'editor', 'maintainer', 'admin']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admins can change roles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const rl = await rateLimitUser(user.id, 'role-change', 30, 3600_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = roleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { user_id, role } = parsed.data

  // Prevent admins from demoting themselves (accidental lockout)
  if (user_id === user.id && role !== 'admin') {
    return NextResponse.json({ error: 'Cannot change your own admin role' }, { status: 400 })
  }

  // Selecting the touched row proves the write landed. This goes through the
  // AUTHED client, so it is permitted only by the "Admins can update any
  // profile" policy (20260417210403_tighten_admin_rls.sql:7-16) — and a row
  // excluded by a policy's USING clause is not an error, just zero rows, which
  // would otherwise return 200 {ok:true} having changed nothing.
  //
  // The gate above already asserted the exact role that policy requires, so
  // zero rows here means no profile carries this id — 404, not another 403 to
  // be confused with the "Admin only" one.
  const { data: updated, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', user_id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'No profile with that id — nothing was updated' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
