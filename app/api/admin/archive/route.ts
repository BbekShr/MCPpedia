import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'

const archiveSchema = z.object({
  server_id: z.string().uuid(),
  archive: z.boolean(), // true = archive, false = unarchive
  reason: z.string().min(1).max(500),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only maintainers and admins can archive
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const rl = await rateLimitUser(user.id, 'archive', 20, 3600_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = archiveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { server_id, archive, reason } = parsed.data

  // Update the server
  const { error } = await supabase
    .from('servers')
    .update({
      is_archived: archive,
      health_status: archive ? 'archived' : 'unknown',
    })
    .eq('id', server_id)

  if (error) {
    console.error('archive error:', error.message)
    return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 })
  }

  // Log the action as an edit for audit trail. This must go through the
  // service-role client: the `edits` INSERT policy only permits rows with
  // status='pending' (anti self-approval farming, see 20260610000000), so a
  // user-scoped insert of an 'approved' audit row is silently rejected by RLS.
  const admin = createAdminClient(`admin-archive:${user.id}`)
  const { error: auditErr } = await admin.from('edits').insert({
    server_id,
    user_id: user.id,
    field_name: 'is_archived',
    old_value: JSON.stringify(!archive),
    new_value: JSON.stringify(archive),
    edit_reason: reason,
    status: 'approved',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  })
  if (auditErr) {
    console.error('archive audit insert failed:', auditErr.message)
  }

  return NextResponse.json({
    ok: true,
    action: archive ? 'archived' : 'unarchived',
  })
}
