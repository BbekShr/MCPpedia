import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'

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
    .select('id, server_id, field_name, new_value, status')
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
    return NextResponse.json({ ok: true, action: 'rejected' })
  }

  if (!ALLOWED_FIELDS.includes(edit.field_name as typeof ALLOWED_FIELDS[number])) {
    return NextResponse.json({ error: 'Field not allowed' }, { status: 400 })
  }

  // Apply the edit. new_value is stored as a string per validators.ts schema.
  const { error: updErr } = await supabase
    .from('servers')
    .update({ [edit.field_name]: edit.new_value })
    .eq('id', edit.server_id)

  if (updErr) {
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

  return NextResponse.json({ ok: true, action: 'approved' })
}
