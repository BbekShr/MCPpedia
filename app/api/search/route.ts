import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitIp } from '@/lib/rate-limit'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'

export async function GET(request: Request) {
  // Rate limit search by IP
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimitIp(ip, 'search', 30, 60_000) // 30 per minute
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1), 50)

  const supabase = await createClient()

  if (q) {
    const { data, error } = await supabase.rpc('search_servers', {
      search_query: q,
      category_filter: null,
      status_filter: null,
      pricing_filter: null,
      sort_by: 'relevance',
      page_size: limit,
      page_offset: 0,
    })

    if (error) {
      console.error('search error:', error.message)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
    return NextResponse.json(
      { servers: data || [] },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  }

  const { data } = await supabase
    .from('servers')
    .select(PUBLIC_SERVER_FIELDS)
    .order('score_total', { ascending: false })
    .limit(limit)

  return NextResponse.json(
    { servers: data || [] },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
