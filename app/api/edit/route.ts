import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { editProposalSchema } from '@/lib/validators'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ edit }, { status: 201 })
}
