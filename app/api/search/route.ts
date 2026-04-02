import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ servers: data || [] })
  }

  const { data } = await supabase
    .from('servers')
    .select('*')
    .order('score_total', { ascending: false })
    .limit(limit)

  return NextResponse.json({ servers: data || [] })
}
