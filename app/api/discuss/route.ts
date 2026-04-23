import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { discussionSchema } from '@/lib/validators'
import { revalidateProfile } from '@/lib/revalidate'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
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
    console.error('discuss insert error:', error.message)
    return NextResponse.json({ error: 'Failed to create discussion' }, { status: 500 })
  }

  // Update profile discussion count (non-critical, display-only)
  try {
    const { count } = await supabase
      .from('discussions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    await supabase
      .from('profiles')
      .update({ discussions_count: count || 0 })
      .eq('id', user.id)
  } catch {
    // Non-critical — rate limiting uses real-time count, not this field
  }

  // DB trigger awards karma for the post; surface it on the profile.
  const { data: poster } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (poster?.username) revalidateProfile(poster.username)

  return NextResponse.json({ discussion }, { status: 201 })
}
