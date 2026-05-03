import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  editProposalSchema,
  LOW_RISK_FIELDS,
  AUTO_APPROVE_EDITS_THRESHOLD,
  type LowRiskField,
} from '@/lib/validators'
import { rateLimitUser } from '@/lib/rate-limit'
import { revalidateServer, revalidateProfile } from '@/lib/revalidate'
import { normalizePackageName } from '@/lib/normalize'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitUser(user.id, 'edit', 20, 3600_000) // 20 per hour
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = editProposalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Verify server exists
  const { data: server } = await supabase
    .from('servers')
    .select('id')
    .eq('id', data.server_id)
    .single()

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }

  // Decide whether this edit can skip moderation. Trusted contributors
  // (>=AUTO_APPROVE_EDITS_THRESHOLD prior approvals) editing a low-risk field
  // get an instant write — the proposal still gets recorded as 'approved' so
  // the history page shows it, just without the pending → approved transition.
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role, edits_approved')
    .eq('id', user.id)
    .single()

  const isPrivilegedRole = profile?.role === 'editor' || profile?.role === 'maintainer' || profile?.role === 'admin'
  const isLowRisk = (LOW_RISK_FIELDS as readonly string[]).includes(data.field_name)
  const meetsTrustThreshold = (profile?.edits_approved ?? 0) >= AUTO_APPROVE_EDITS_THRESHOLD
  const shouldAutoApprove = isLowRisk && (isPrivilegedRole || meetsTrustThreshold)

  const status: 'pending' | 'approved' = shouldAutoApprove ? 'approved' : 'pending'

  const { data: edit, error } = await supabase
    .from('edits')
    .insert({
      server_id: data.server_id,
      user_id: user.id,
      field_name: data.field_name,
      old_value: data.old_value,
      new_value: data.new_value,
      edit_reason: data.edit_reason,
      status,
      ...(shouldAutoApprove
        ? { reviewed_by: null, reviewed_at: new Date().toISOString() }
        : {}),
    })
    .select()
    .single()

  if (error) {
    console.error('edit insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit edit' }, { status: 500 })
  }

  if (shouldAutoApprove) {
    // Apply the change directly. The admin client carries the proposer's
    // user_id so the audit trigger credits them, and an actor_label of
    // 'auto-approved' to make the path traceable separately from a moderator
    // approval. Mirrors the package-name normalization used in approve-edit.
    const valueToWrite = (data.field_name === 'npm_package' || data.field_name === 'pip_package')
      ? normalizePackageName(data.new_value)
      : data.new_value
    const update: Record<string, unknown> = { [data.field_name as LowRiskField]: valueToWrite }
    if (data.field_name === 'description') update.description_source = 'human'

    const admin = createAdminClient('auto-approved', user.id)
    const { error: updErr } = await admin
      .from('servers')
      .update(update)
      .eq('id', data.server_id)

    if (updErr) {
      // The proposal is recorded as approved but the write failed — flip it
      // back to pending so a moderator can sort it out. Log loudly.
      console.error('auto-approve apply failed; reverting edit to pending:', updErr.message)
      await supabase.from('edits').update({ status: 'pending', reviewed_at: null }).eq('id', edit.id)
      return NextResponse.json({ error: 'Auto-apply failed; edit queued for review' }, { status: 500 })
    }

    // Refresh the affected server page so the change is visible immediately.
    const { data: srv } = await supabase
      .from('servers')
      .select('slug')
      .eq('id', data.server_id)
      .single()
    if (srv?.slug) revalidateServer(srv.slug)
  }

  if (profile?.username) revalidateProfile(profile.username)

  return NextResponse.json({ edit, autoApproved: shouldAutoApprove }, { status: 201 })
}
