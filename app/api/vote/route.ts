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

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = voteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { discussion_id, value } = parsed.data

  // Atomic vote + recount in a single database transaction
  const { data: netVotes, error } = await supabase.rpc('vote_and_recount', {
    p_user_id: user.id,
    p_discussion_id: discussion_id,
    p_value: value,
  })

  if (error) {
    console.error('vote error:', error.message)
    return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 })
  }

  return NextResponse.json({ upvotes: netVotes })
}
