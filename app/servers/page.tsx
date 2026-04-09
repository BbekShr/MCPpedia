import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import SearchBar from '@/components/SearchBar'
import FilterBar from '@/components/FilterBar'
import ScoreFilterPills from '@/components/ScoreFilterPills'
import { ITEMS_PER_PAGE, PUBLIC_SERVER_FIELDS, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateItemListJsonLd } from '@/lib/seo'
import type { Server } from '@/lib/types'
import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Browse MCP Servers',
  description: 'Search and browse MCP servers scored on security, maintenance, and efficiency. Filter by category, transport, status, and more.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'}/servers` },
}

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const q = params.q || ''
  const category = params.category || ''
  const status = params.status || ''
  const pricing = params.pricing || ''
  const author = params.author || ''
  const transport = params.transport || ''
  const sort = params.sort || ''
  const minScore = parseInt(params.min_score || '0', 10)
  const page = parseInt(params.page || '1', 10)
  const offset = (page - 1) * ITEMS_PER_PAGE

  const supabase = await createClient()

  let servers: Server[] = []
  let totalCount = 0

  if (q) {
    // Fetch all search results, then apply app-side filters (min_score, transport, author)
    // and paginate in JS. Supabase RPC doesn't support count with head:true.
    const { data, error } = await supabase.rpc('search_servers', {
      search_query: q,
      category_filter: category || null,
      status_filter: status || null,
      pricing_filter: pricing || null,
      sort_by: sort || 'relevance',
      page_size: 100000,
      page_offset: 0,
    })
    if (!error && data) {
      let results = data as Server[]
      if (minScore > 0) results = results.filter(s => (s.score_total || 0) >= minScore)
      if (transport) results = results.filter(s => (s.transport || []).includes(transport))
      if (author) results = results.filter(s => s.author_type === author)
      totalCount = results.length
      servers = results.slice(offset, offset + ITEMS_PER_PAGE)
    }
  } else {
    // Direct query — hide archived by default
    let query = supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS, { count: 'exact' })
      .eq('is_archived', false)

    if (category) query = query.contains('categories', [category])
    if (status) query = query.eq('health_status', status)
    if (pricing) query = query.eq('api_pricing', pricing)
    if (author) query = query.eq('author_type', author)
    if (transport) query = query.contains('transport', [transport])
    if (minScore > 0) query = query.gte('score_total', minScore)

    switch (sort) {
      case 'stars':
        query = query.order('github_stars', { ascending: false })
        break
      case 'downloads':
        query = query.order('npm_weekly_downloads', { ascending: false })
        break
      case 'commit':
        query = query.order('github_last_commit', { ascending: false, nullsFirst: false })
        break
      case 'newest':
        query = query.order('created_at', { ascending: false })
        break
      case 'name':
        query = query.order('name', { ascending: true })
        break
      default:
        // Default: score descending
        query = query.order('score_total', { ascending: false })
    }

    query = query.range(offset, offset + ITEMS_PER_PAGE - 1)

    const { data, count } = await query
    servers = (data as Server[]) || []
    totalCount = count || 0
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Build ItemList schema for the first page of default (non-search) results
  const itemListJsonLd = !q && page === 1 && servers.length > 0
    ? generateItemListJsonLd(
        servers.slice(0, 20).map(s => ({
          name: `${s.name} MCP Server`,
          url: `${SITE_URL}/s/${s.slug}`,
          description: s.tagline || s.description || undefined,
        }))
      )
    : null

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {itemListJsonLd && <JsonLdScript data={itemListJsonLd} />}
      <div className="mb-6">
        <SearchBar
          placeholder={`Search ${totalCount.toLocaleString()}+ MCP servers...`}
          large
        />
      </div>

      <div className="mb-4">
        <FilterBar />
      </div>

      <div className="mb-4">
        <ScoreFilterPills />
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">
          {q
            ? `${totalCount.toLocaleString()} server${totalCount !== 1 ? 's' : ''} matching "${q}"`
            : `${totalCount.toLocaleString()} servers`
          }
        </p>
      </div>

      <div className="space-y-3">
        {servers.map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted mb-2">No servers found.</p>
          <Link href="/submit" className="text-sm text-accent hover:text-accent-hover">
            Submit a server &rarr;
          </Link>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/servers?${new URLSearchParams({ ...params, page: String(page - 1) } as Record<string, string>).toString()}`}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/servers?${new URLSearchParams({ ...params, page: String(page + 1) } as Record<string, string>).toString()}`}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
