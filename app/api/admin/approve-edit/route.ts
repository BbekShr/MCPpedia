import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'
import { revalidateServer, revalidateProfile } from '@/lib/revalidate'
import { normalizePackageName } from '@/lib/normalize'

// Allowed editable fields must match EDITABLE_FIELDS in lib/validators.ts
const ALLOWED_FIELDS = [
  'name', 'tagline', 'description', 'api_name', 'api_pricing',
  'api_rate_limits', 'homepage_url', 'npm_package', 'pip_package',
] as const

const approveSchema = z.object({
  edit_id: z.string().uuid(),
  reject: z.boolean().optional(),
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

  if (!profile || !['editor', 'maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const rl = await rateLimitUser(user.id, 'approve-edit', 200, 3600_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { edit_id, reject } = parsed.data

  const { data: edit, error: fetchErr } = await supabase
    .from('edits')
    .select('id, server_id, user_id, field_name, new_value, status')
    .eq('id', edit_id)
    .single()

  if (fetchErr || !edit) {
    return NextResponse.json({ error: 'Edit not found' }, { status: 404 })
  }

  if (edit.status !== 'pending') {
    return NextResponse.json({ error: 'Edit already reviewed' }, { status: 409 })
  }

  if (reject) {
    const { data: rejected, error: rejectErr } = await supabase
      .from('edits')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', edit_id)
      .select('id')

    // Nothing has been applied to `servers` on this path, so there is nothing to
    // recover — but the caller must not be told the rejection succeeded. Zero rows
    // is as fatal as an error: the only UPDATE policy on `edits` is the
    // editor|maintainer|admin one (20260417210403_tighten_admin_rls.sql:28-37), so
    // an empty result means RLS refused the write or the row moved under us, and
    // either way the edit is still 'pending' and still in the queue. 500, NOT 404:
    // the row's existence was just proven by the .single() read above, so "no rows"
    // here cannot mean "no such edit". No service-role retry by design — see the
    // approve path below for why the asymmetry is deliberate.
    if (rejectErr || !rejected || rejected.length === 0) {
      console.error('approve-edit reject bookkeeping did not land; edit_id:', edit_id,
        rejectErr ? `errored: ${rejectErr.code} ${rejectErr.message}` : 'matched zero rows')
      return NextResponse.json(
        { error: 'Failed to record the rejection; the edit is still pending' },
        { status: 500 },
      )
    }

    if (edit.user_id && edit.user_id !== user.id) {
      await supabase.from('notifications').insert({
        user_id: edit.user_id,
        type: 'edit_rejected',
        edit_id: edit.id,
        server_id: edit.server_id,
        field_name: edit.field_name,
      })
    }
    // Rejection triggers a karma refund for the proposer — refresh their profile.
    const { data: author } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', edit.user_id)
      .single()
    if (author?.username) revalidateProfile(author.username)
    return NextResponse.json({ ok: true, action: 'rejected' })
  }

  // Approval THROUGH THIS ROUTE requires a second pair of eyes — no self-approval,
  // for ANY role. Note this is no longer a site-wide invariant: /api/edit has a
  // one-step self-approval path (S48), where a trusted contributor's or a privileged
  // role's edit is written as 'approved' and applied in the same request. That path
  // is bounded to LOW_RISK_FIELDS (lib/validators.ts) — the prose fields tagline,
  // description, api_name, api_pricing, api_rate_limits — and everything outside that
  // set is still governed by the stricter block below.
  // ALLOWED_FIELDS here covers identity/install fields (name, homepage_url, npm_package,
  // pip_package) that LOW_RISK_FIELDS deliberately excludes from auto-apply precisely
  // because a swapped package leaves dead links and broken installs in the wild. Without
  // this check, one account could queue such an edit via /api/edit and immediately
  // approve it here; the DB's `status='pending'` INSERT policy ("prevent self-approval
  // farming") no longer blocks a one-step insert either, since /api/edit's auto-approve
  // path inserts through the service role.
  // An admin approving their own identity edit defeats the review exactly as much as an
  // editor doing so, so do NOT relax this to `editor`-only: another reviewer can approve
  // it, or an admin can use the direct admin edit path. Self-REJECTION stays permitted
  // above (withdrawing your own pending edit is legitimate).
  if (edit.user_id === user.id) {
    return NextResponse.json(
      { error: 'Cannot approve your own edit' },
      { status: 403 },
    )
  }

  if (!ALLOWED_FIELDS.includes(edit.field_name as typeof ALLOWED_FIELDS[number])) {
    return NextResponse.json({ error: 'Field not allowed' }, { status: 400 })
  }

  // Apply the edit. new_value is stored as a string per validators.ts schema.
  // Normalize package names so they collapse against the dedup index.
  const valueToWrite =
    edit.field_name === 'npm_package' || edit.field_name === 'pip_package'
      ? normalizePackageName(edit.new_value)
      : edit.new_value

  const update: Record<string, unknown> = { [edit.field_name]: valueToWrite }
  // Mark description as human-curated so enrich-descriptions stops touching it.
  if (edit.field_name === 'description') update.description_source = 'human'

  // Apply the change through the admin client carrying the proposer's user_id
  // in `x-original-actor-id`. The audit trigger picks that up so the resulting
  // server_changes row credits the contributor, not the moderator.
  const admin = createAdminClient(`approved-by:${user.id}`, edit.user_id)
  // `.select()` so the write is VERIFIED rather than assumed: a zero-row match
  // resolves `error: null`, and `edits.server_id` is ON DELETE CASCADE, so a row
  // deleted between the read above and this write would otherwise let the route
  // report an approval that changed nothing. The returned slug is also what the
  // double-failure branch below revalidates with.
  const { data: applied, error: updErr } = await admin
    .from('servers')
    .update(update)
    .eq('id', edit.server_id)
    .select('id, slug')

  if (updErr) {
    if (updErr.code === '23505') {
      return NextResponse.json({
        error: 'duplicate',
        message: 'Cannot apply edit: another server already uses this identifier.',
      }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to apply edit' }, { status: 500 })
  }

  // 500, not 404, for the same reason the reject branch above gives: this route
  // does not answer 404 for a state it proved existed a moment ago. Nothing was
  // applied and no bookkeeping is attempted, so the edit stays pending.
  if (!applied || applied.length === 0) {
    console.error('approve-edit servers update matched zero rows; edit_id:', edit_id, 'server_id:', edit.server_id)
    return NextResponse.json(
      { error: 'Server row not found; nothing was applied and the edit is still pending' },
      { status: 500 },
    )
  }
  const appliedSlug: string | null = applied[0]?.slug ?? null

  // Bookkeeping only — the servers change above is VERIFIED landed (the write
  // returned the row it matched) and is the user-visible truth. Payload is hoisted so the retry below writes the same
  // reviewed_at rather than a second, later timestamp.
  const bookkeeping = {
    status: 'approved',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }

  const { data: marked, error: markErr } = await supabase
    .from('edits')
    .update(bookkeeping)
    .eq('id', edit_id)
    .select('id')

  // If this write does nothing, the edit stays 'pending' against a server that
  // ALREADY carries the change: the queue keeps showing it, and re-approving
  // double-applies and duplicates the notification. Retry through the service
  // role rather than rolling the servers write back. Rolling back would write a
  // SECOND server_changes audit row (20260416010000_server_changes_audit.sql:96-99
  // fires per UPDATE) and needs an old_value this route never selects; the
  // bookkeeping is pure record-keeping, no role can write status='pending'
  // through RLS anyway (20260417210403_tighten_admin_rls.sql:34-37), and the
  // karma/counter triggers key on NEW.user_id, not auth.uid()
  // (20260421030000_karma.sql:121-129), so a service-role write stays credited to
  // the proposer. Same recovery shape as app/api/edit/route.ts:169-195.
  // Zero rows is treated exactly like an error — the authed client's UPDATE
  // policy can refuse silently, and supabase-js resolves rather than throws.
  if (markErr || !marked || marked.length === 0) {
    console.error('approve-edit bookkeeping did not land; retrying through the service role; edit_id:', edit_id,
      markErr ? `errored: ${markErr.code} ${markErr.message}` : 'matched zero rows')
    const { data: retried, error: retryErr } = await admin
      .from('edits')
      .update(bookkeeping)
      .eq('id', edit_id)
      .select('id')
    if (retryErr || !retried || retried.length === 0) {
      // Do NOT claim success and do NOT 404: the row exists (proved by the
      // .single() read above) and the servers change is already applied, so this
      // is a partial success the moderator has to know about. Mirrors the
      // operator-attention 500 at app/api/edit/route.ts:186-192.
      console.error('approve-edit bookkeeping retry failed; edit left pending against an APPLIED server change; edit_id:', edit_id,
        retryErr ? `errored: ${retryErr.code} ${retryErr.message}` : 'matched zero rows')
      // The servers change IS applied, so /s/<slug> must not keep serving the old
      // value for the 7-day ISR TTL while the edit sits pending. The operator is
      // told about the bookkeeping; the cache must not silently disagree with the DB.
      if (appliedSlug) revalidateServer(appliedSlug)
      return NextResponse.json(
        { error: 'Edit applied to the server but could not be marked approved; it will keep showing as pending and needs operator attention' },
        { status: 500 },
      )
    }
  }

  if (edit.user_id && edit.user_id !== user.id) {
    await supabase.from('notifications').insert({
      user_id: edit.user_id,
      type: 'edit_approved',
      edit_id: edit.id,
      server_id: edit.server_id,
      field_name: edit.field_name,
    })
  }

  // Refresh the affected server page (plus /compare pages containing it)
  // and the proposer's profile, so the approval is visible immediately
  // instead of waiting for the 7-day TTL.
  const [{ data: server }, { data: author }] = await Promise.all([
    supabase.from('servers').select('slug').eq('id', edit.server_id).single(),
    supabase.from('profiles').select('username').eq('id', edit.user_id).single(),
  ])
  if (server?.slug) revalidateServer(server.slug)
  if (author?.username) revalidateProfile(author.username)

  return NextResponse.json({ ok: true, action: 'approved' })
}
