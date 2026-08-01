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
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .single()

  if (profileErr) {
    // Fail closed, exactly like the trust count below: without the profile we
    // cannot tell a privileged role from a stranger, and `profile` being null
    // would otherwise fall straight through to the count branch and auto-apply.
    // The edit queues for moderation, which is a working outcome.
    console.error('edit profile read failed; queuing for review:', profileErr.code, profileErr.message)
  }

  const isPrivilegedRole = profile?.role === 'editor' || profile?.role === 'maintainer' || profile?.role === 'admin'
  const isLowRisk = (LOW_RISK_FIELDS as readonly string[]).includes(data.field_name)

  // The trust count is DERIVED from the edits table rather than read from the
  // stored `profiles.edits_approved` counter: that counter was forgeable through
  // the stale profiles UPDATE policy (S23), and
  // 20260725000000_fix_profiles_privilege_escalation.sql:209-211 names this very
  // gate as the door that forgery opened. A filtered count is un-forgeable under
  // every RLS state, so this no longer depends on whether that migration is
  // applied. Authed client on purpose: the `edits` SELECT policy is
  // `using (true)` (20260402000000_initial_schema.sql:316-317) so nothing is
  // RLS-filtered here, the predicate is scoped to this user so the count stays
  // complete even if that policy is later tightened to owner-only, and it keeps
  // service-role usage confined to the two writes that genuinely need a bypass.
  let meetsTrustThreshold = false
  if (isLowRisk && !isPrivilegedRole && !profileErr) {
    // `reviewed_by is not null` is what keeps the trust count from feeding
    // itself: this route's own auto-approved insert writes status 'approved'
    // with `reviewed_by: null`, so an unfiltered count would let every edit it
    // waves through raise the very threshold that authorized it — trust would
    // become self-sustaining and irrevocable, since abusive edits never queue
    // for a moderator to act on. The count must be of approvals granted by
    // SOMEONE ELSE (approve-edit/route.ts:152 stamps `reviewed_by: user.id`),
    // never of rows this route minted for the caller. No legitimate user is
    // demoted by it: reaching the threshold requires three prior approvals, and
    // the first three necessarily came from a moderator. It also stops an edit
    // stranded at 'approved' by a failed revert below from inflating the gate.
    const { count, error: countErr } = await supabase
      .from('edits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .not('reviewed_by', 'is', null)
    if (countErr) {
      // Fail closed: the edit queues for moderation, which is a working outcome.
      console.error('edit trust count failed; queuing for review:', countErr.code, countErr.message)
    } else {
      meetsTrustThreshold = (count ?? 0) >= AUTO_APPROVE_EDITS_THRESHOLD
    }
  }
  const shouldAutoApprove = !profileErr && isLowRisk && (isPrivilegedRole || meetsTrustThreshold)

  const status: 'pending' | 'approved' = shouldAutoApprove ? 'approved' : 'pending'

  // Apply the change with the proposer's user_id on the admin client so the
  // audit trigger credits them, and an actor_label of 'auto-approved' to make
  // the path traceable separately from a moderator approval.
  const admin = shouldAutoApprove ? createAdminClient('auto-approved', user.id) : null

  // The insert must go through the service-role client when the row is
  // 'approved': the `edits` INSERT policy pins `auth.uid() = user_id AND
  // status = 'pending'` (20260610000000_security_hardening.sql:28-35), so an
  // authed insert of an approved row is RLS-denied. The pending path stays on
  // the authed client so ordinary proposals keep going through RLS. Unlike the
  // best-effort audit insert in admin/archive, this one is load-bearing — the
  // route returns the row and needs `edit.id` — so its error stays fatal. No
  // 42501 branch: under the service role RLS is bypassed by construction, so an
  // RLS denial here is unreachable; error.code is logged at every failure site.
  const { data: edit, error } = await (admin ?? supabase)
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
    console.error('edit insert error:', error.code, error.message)
    return NextResponse.json({ error: 'Failed to submit edit' }, { status: 500 })
  }

  if (shouldAutoApprove && admin) {
    // Mirrors the package-name normalization used in approve-edit.
    const valueToWrite = (data.field_name === 'npm_package' || data.field_name === 'pip_package')
      ? normalizePackageName(data.new_value)
      : data.new_value
    const update: Record<string, unknown> = { [data.field_name as LowRiskField]: valueToWrite }
    if (data.field_name === 'description') update.description_source = 'human'

    const { error: updErr } = await admin
      .from('servers')
      .update(update)
      .eq('id', data.server_id)

    if (updErr) {
      // The proposal is recorded as approved but the write failed — flip it
      // back to pending so a moderator can sort it out. Log loudly.
      console.error('auto-approve apply failed; reverting edit to pending:', updErr.code, updErr.message)
      // Admin client: the only UPDATE policy on `edits` carries
      // `WITH CHECK ... AND status IN ('approved','rejected')`
      // (20260417210403_tighten_admin_rls.sql:34-37), so writing 'pending' is
      // rejected for EVERY role including admins. This recovery path has never
      // executed — the insert above was itself RLS-denied until this fix — so
      // its failure is reported rather than discarded.
      const { error: revertErr } = await admin
        .from('edits')
        .update({ status: 'pending', reviewed_at: null })
        .eq('id', edit.id)
      if (revertErr) {
        console.error('auto-approve revert failed; edit left approved:', revertErr.code, revertErr.message)
        // Do NOT claim it was queued: the row is still 'approved', and the
        // moderation queue only shows and counts 'pending' rows
        // (app/admin/page.tsx:207-210,630), so no moderator can ever see it.
        return NextResponse.json(
          { error: 'Auto-apply failed and the edit could not be re-queued; it was recorded but not applied and needs operator attention' },
          { status: 500 },
        )
      }
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
