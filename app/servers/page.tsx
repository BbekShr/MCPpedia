import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import SearchBar from '@/components/SearchBar'
import FilterBar from '@/components/FilterBar'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import type { Server } from '@/lib/types'
import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Browse MCP Servers',
  description: 'Search and browse the complete directory of MCP servers. Filter by category, status, and more.',
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
  const sort = params.sort || ''
  const page = parseInt(params.page || '1', 10)
  const offset = (page - 1) * ITEMS_PER_PAGE

  const supabase = await createClient()

  let servers: Server[] = []
  let totalCount = 0

  if (q) {
    // Use FTS function
    const { data, error } = await supabase.rpc('search_servers', {
      search_query: q,
      category_filter: category || null,
      status_filter: status || null,
      pricing_filter: pricing || null,
      sort_by: sort || 'relevance',
      page_size: ITEMS_PER_PAGE,
      page_offset: offset,
    })
    if (!error && data) {
      servers = data as Server[]
    }
    // Get count
    const { count } = await supabase.rpc('search_servers', {
      search_query: q,
      category_filter: category || null,
      status_filter: status || null,
      pricing_filter: pricing || null,
      sort_by: sort || 'relevance',
      page_size: 100000,
      page_offset: 0,
    }, { count: 'exact', head: true })
    totalCount = count || 0
  } else {
    // Direct query — hide archived by default
    let query = supabase
      .from('servers')
      .select('*', { count: 'exact' })
      .eq('is_archived', false)

    if (category) query = query.contains('categories', [category])
    if (status) query = query.eq('health_status', status)
    if (pricing) query = query.eq('api_pricing', pricing)
    if (author) query = query.eq('author_type', author)

    switch (sort) {
      case 'stars':
        query = query.order('github_stars', { ascending: false })
        break
      case 'newest':
        query = query.order('created_at', { ascending: false })
        break
      case 'name':
        query = query.order('name', { ascending: true })
        break
      case 'downloads':
        query = query.order('npm_weekly_downloads', { ascending: false })
        break
      default:
        query = query.order('github_stars', { ascending: false })
    }

    query = query.range(offset, offset + ITEMS_PER_PAGE - 1)

    const { data, count } = await query
    servers = (data as Server[]) || []
    totalCount = count || 0
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="mb-6">
        <SearchBar placeholder="Search MCP servers..." />
      </div>

      <div className="mb-6">
        <FilterBar />
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">
          Showing {servers.length} of {totalCount} servers
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
