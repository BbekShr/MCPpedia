import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitUser } from '@/lib/rate-limit'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

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

  const rl = await rateLimitUser(user.id, 'favorites', 60, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsedId = uuidSchema.safeParse(body?.server_id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Valid server_id required' }, { status: 400 })
  }
  const serverId = parsedId.data

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
      console.error('favorites insert error:', error.message)
      return NextResponse.json({ error: 'Failed to save favorite' }, { status: 500 })
    }
    return NextResponse.json({ favorited: true })
  }
}
