import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { discussionSchema } from '@/lib/validators'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = discussionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Rate limiting: check post count in last 24 hours
  const { data: profile } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', user.id)
    .single()

  const isNewAccount = profile &&
    (Date.now() - new Date(profile.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentPosts } = await supabase
    .from('discussions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', dayAgo)

  const limit = isNewAccount ? 3 : 30
  if ((recentPosts || 0) >= limit) {
    return NextResponse.json(
      { error: `Rate limited. You can post up to ${limit} times per day.` },
      { status: 429 }
    )
  }

  // Verify parent exists if replying
  if (data.parent_id) {
    const { data: parent } = await supabase
      .from('discussions')
      .select('server_id')
      .eq('id', data.parent_id)
      .single()

    if (!parent || parent.server_id !== data.server_id) {
      return NextResponse.json({ error: 'Invalid parent discussion' }, { status: 400 })
    }
  }

  const { data: discussion, error } = await supabase
    .from('discussions')
    .insert({
      server_id: data.server_id,
      user_id: user.id,
      parent_id: data.parent_id || null,
      body: data.body,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update profile discussion count (non-critical)
  try {
    await supabase
      .from('profiles')
      .update({ discussions_count: (await supabase.from('discussions').select('*', { count: 'exact', head: true }).eq('user_id', user.id)).count || 0 })
      .eq('id', user.id)
  } catch {
    // Non-critical
  }

  return NextResponse.json({ discussion }, { status: 201 })
}
