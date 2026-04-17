import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'

const verifySchema = z.object({
  server_id: z.string().uuid(),
  verified: z.boolean(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const rl = await rateLimitUser(user.id, 'verify', 60, 3600_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { server_id, verified } = parsed.data

  const { error } = await supabase
    .from('servers')
    .update({ verified })
    .eq('id', server_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  await supabase.from('edits').insert({
    server_id,
    user_id: user.id,
    field_name: 'verified',
    old_value: JSON.stringify(!verified),
    new_value: JSON.stringify(verified),
    edit_reason: 'Admin verify toggle',
    status: 'approved',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
