import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitUser } from '@/lib/rate-limit'

const THRESHOLD = 3 // verifications needed for "Community Verified" badge

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimitUser(user.id, 'community-verify', 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const body = await request.json()
  const serverId = body.server_id
  if (!serverId || typeof serverId !== 'string') {
    return NextResponse.json({ error: 'Missing server_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check if already verified by this user
  const { data: existing } = await supabase
    .from('community_verifications')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('server_id', serverId)
    .single()

  if (existing) {
    // Toggle off — remove verification
    await supabase
      .from('community_verifications')
      .delete()
      .eq('user_id', user.id)
      .eq('server_id', serverId)
  } else {
    // Add verification
    await supabase
      .from('community_verifications')
      .insert({ user_id: user.id, server_id: serverId })
  }

  // Recount
  const { count } = await supabase
    .from('community_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('server_id', serverId)

  const verificationCount = count || 0

  // Update server with count + badge status (use admin to bypass RLS)
  await admin
    .from('servers')
    .update({
      community_verification_count: verificationCount,
      community_verified: verificationCount >= THRESHOLD,
    })
    .eq('id', serverId)

  return NextResponse.json({
    count: verificationCount,
    verified: verificationCount >= THRESHOLD,
    user_verified: !existing, // toggled: if existed before, now removed
  })
}

// GET — check if current user has verified this server
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { searchParams } = new URL(request.url)
  const serverId = searchParams.get('server_id')
  if (!serverId) return NextResponse.json({ error: 'Missing server_id' }, { status: 400 })

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
