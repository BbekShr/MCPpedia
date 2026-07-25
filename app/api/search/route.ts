import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitIp, getClientIp } from '@/lib/rate-limit'
import { PUBLIC_CARD_FIELDS, PUBLIC_CARD_FIELD_LIST, projectFields } from '@/lib/constants'

export async function GET(request: Request) {
  const rl = await rateLimitIp(getClientIp(request), 'search', 30, 60_000)
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
    // Project the setof-servers RPC rows down to the same allow-list the
    // non-search branch below selects — the RPC returns every column.
    return NextResponse.json(
      { servers: projectFields(data, PUBLIC_CARD_FIELD_LIST) },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } }
    )
  }

  const { data } = await supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS)
    .order('score_total', { ascending: false })
    .limit(limit)

  return NextResponse.json(
    { servers: data || [] },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } }
  )
}
