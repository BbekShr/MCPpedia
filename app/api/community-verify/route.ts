import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitUser } from '@/lib/rate-limit'

const THRESHOLD = 3 // verifications needed for "Community Verified" badge

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitUser(user.id, 'community-verify', 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const serverId = body.server_id
  if (!serverId || typeof serverId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId)) {
    return NextResponse.json({ error: 'Missing or invalid server_id' }, { status: 400 })
  }

  // Atomic toggle + recount in a single database transaction
  const { data, error } = await supabase.rpc('toggle_community_verify', {
    p_user_id: user.id,
    p_server_id: serverId,
    p_threshold: THRESHOLD,
  })

  if (error) {
    console.error('community-verify error:', error.message)
    return NextResponse.json({ error: 'Failed to update verification' }, { status: 500 })
  }

  return NextResponse.json(data)
}

// GET — check if current user has verified this server
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { searchParams } = new URL(request.url)
  const serverId = searchParams.get('server_id')
  if (!serverId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId)) {
    return NextResponse.json({ error: 'Missing or invalid server_id' }, { status: 400 })
  }

  if (!user) {
    return NextResponse.json({ user_verified: false })
  }

  const { data } = await supabase
    .from('community_verifications')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('server_id', serverId)
    .single()

  return NextResponse.json({ user_verified: !!data })
}
