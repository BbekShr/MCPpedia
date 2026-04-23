import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { editProposalSchema } from '@/lib/validators'
import { rateLimitUser } from '@/lib/rate-limit'
import { revalidateProfile } from '@/lib/revalidate'

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

  const { data: edit, error } = await supabase
    .from('edits')
    .insert({
      server_id: data.server_id,
      user_id: user.id,
      field_name: data.field_name,
      old_value: data.old_value,
      new_value: data.new_value,
      edit_reason: data.edit_reason,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('edit insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit edit' }, { status: 500 })
  }

  // DB trigger awards karma for the proposal; surface it on the profile.
  const { data: proposer } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (proposer?.username) revalidateProfile(proposer.username)

  return NextResponse.json({ edit }, { status: 201 })
}
