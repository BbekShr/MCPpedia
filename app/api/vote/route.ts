import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { voteSchema } from '@/lib/validators'
import { rateLimitUser } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimitUser(user.id, 'vote', 60, 60_000) // 60 per minute
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const body = await request.json()
  const parsed = voteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { discussion_id, value } = parsed.data

  // Check for existing vote
  const { data: existingVote } = await supabase
    .from('votes')
    .select('value')
    .eq('user_id', user.id)
    .eq('discussion_id', discussion_id)
    .single()

  if (existingVote) {
    if (existingVote.value === value) {
      // Toggle off: remove vote
      await supabase
        .from('votes')
        .delete()
        .eq('user_id', user.id)
        .eq('discussion_id', discussion_id)
    } else {
      // Change vote
      await supabase
        .from('votes')
        .update({ value })
        .eq('user_id', user.id)
        .eq('discussion_id', discussion_id)
    }
  } else {
    // New vote
    await supabase
      .from('votes')
      .insert({ user_id: user.id, discussion_id, value })
  }

  // Recompute upvotes on the discussion
  const { count: upCount } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('discussion_id', discussion_id)
    .eq('value', 1)

  const { count: downCount } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('discussion_id', discussion_id)
    .eq('value', -1)

  const netVotes = (upCount || 0) - (downCount || 0)

  await supabase
    .from('discussions')
    .update({ upvotes: netVotes })
    .eq('id', discussion_id)

  return NextResponse.json({ upvotes: netVotes })
}
