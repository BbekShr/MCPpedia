import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/favorites — list current user's favorites (returns server_ids)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ favorites: [] })
  }

  const { data } = await supabase
    .from('favorites')
    .select('server_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    favorites: (data || []).map((f: { server_id: string }) => f.server_id),
  })
}

// POST /api/favorites — toggle a favorite
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in to save servers' }, { status: 401 })
  }

  const body = await request.json()
  const serverId = body.server_id

  if (!serverId) {
    return NextResponse.json({ error: 'server_id required' }, { status: 400 })
  }

  // Check if already favorited
  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('server_id', serverId)
    .maybeSingle()

  if (existing) {
    // Remove favorite
    await supabase
      .from('favorites')
      .delete()
      .eq('id', existing.id)
    return NextResponse.json({ favorited: false })
  } else {
    // Add favorite
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, server_id: serverId })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ favorited: true })
  }
}
