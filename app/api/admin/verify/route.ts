import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Authed client: the servers UPDATE policy is role-gated
  // (20260417210403_tighten_admin_rls.sql:18-26) and a USING-clause exclusion is
  // zero rows, not an error. Prove the write landed before the audit row below
  // records a change that never happened.
  //
  // The gate above already asserted the exact roles that policy requires, so
  // zero rows here means no server carries this id — 404, not another 403 to be
  // confused with the "Insufficient permissions" one.
  const { data: updated, error } = await supabase
    .from('servers')
    .update({ verified })
    .eq('id', server_id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'No server with that id — nothing was updated' }, { status: 404 })
  }

  // Audit row must go through the service-role client: the `edits` INSERT
  // policy only permits status='pending' rows (see 20260610000000), so a
  // user-scoped insert of this 'approved' audit row is silently RLS-rejected.
  const admin = createAdminClient(`admin-verify:${user.id}`)
  const { error: auditErr } = await admin.from('edits').insert({
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
  if (auditErr) {
    console.error('verify audit insert failed:', auditErr.message)
  }

  return NextResponse.json({ ok: true })
}
