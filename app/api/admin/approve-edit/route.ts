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
    await supabase
      .from('edits')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', edit_id)
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
  const { error: updErr } = await admin
    .from('servers')
    .update(update)
    .eq('id', edit.server_id)

  if (updErr) {
    if (updErr.code === '23505') {
      return NextResponse.json({
        error: 'duplicate',
        message: 'Cannot apply edit: another server already uses this identifier.',
      }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to apply edit' }, { status: 500 })
  }

  await supabase
    .from('edits')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', edit_id)

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
