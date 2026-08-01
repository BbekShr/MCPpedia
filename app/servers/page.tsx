import { createPublicClient } from '@/lib/supabase/public'
import ServerCard from '@/components/ServerCard'
import SearchBar from '@/components/SearchBar'
import FilterBar from '@/components/FilterBar'
import ScoreFilterPills from '@/components/ScoreFilterPills'
import {
  ITEMS_PER_PAGE,
  PUBLIC_CARD_FIELDS,
  PUBLIC_CARD_FIELD_LIST,
  SITE_URL,
  projectFields,
} from '@/lib/constants'
import { normalizeServersQuery, type ServersListingParams } from '@/lib/servers-query'
import {
  JsonLdScript,
  generateItemListJsonLd,
  generateBreadcrumbJsonLd,
  generateCollectionJsonLd,
} from '@/lib/seo'
import type { Server } from '@/lib/types'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import BlinkLogo from '@/components/BlinkLogo'

export const revalidate = 60

// Cap the reachable offset at the same 10k the public API uses
// (app/api/v1/servers/route.ts:10). Past it Postgres has to walk the whole
// ordered set, which blows anon's 3s statement timeout — and the error path
// below then rendered a 200-OK "No servers found" catalog with the pagination
// hidden, i.e. a silently empty encyclopedia. Nothing legitimate browses that
// deep, so a page beyond the cap 404s instead of running the query.
const MAX_OFFSET = 10_000
const MAX_PAGE = Math.floor(MAX_OFFSET / ITEMS_PER_PAGE)

function parsePage(raw: string | undefined): number {
  const n = parseInt(raw || '1', 10)
  return Number.isNaN(n) || n < 1 ? 1 : n
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}): Promise<Metadata> {
  const params = await searchParams
  return {
    title: 'Browse MCP Servers',
    description: 'Search and browse MCP servers scored on security, maintenance, and efficiency. Filter by category, transport, status, and more.',
    alternates: { canonical: `${SITE_URL}/servers` },
    // Deep pages are near-duplicate slices of the same catalog and all
    // canonicalize to /servers — keep crawlers off the offset walk, but let
    // them follow through to the individual server pages they link to.
    ...(parsePage(params.page) > 1 ? { robots: { index: false, follow: true } } : {}),
  }
}

async function fetchServersListing(
  p: ServersListingParams,
): Promise<{ servers: Server[]; totalCount: number }> {
  const supabase = createPublicClient()

  if (p.mode === 'search') {
    // Fetch one page of search results from Supabase RPC with DB-side pagination.
    // ALL filters (incl. min_score/transport/author) run in the RPC so
    // pagination and hasNextPage are computed over the already-filtered set.
    // We request one extra row to detect if there's a next page.
    const { data, error } = await supabase.rpc('search_servers', {
      search_query: p.q,
      category_filter: p.category || null,
      status_filter: p.status || null,
      pricing_filter: p.pricing || null,
      sort_by: p.sort,
      page_size: ITEMS_PER_PAGE + 1,
      page_offset: p.offset,
      min_score_filter: p.minScore > 0 ? p.minScore : null,
      transport_filter: p.transport || null,
      author_filter: p.author || null,
    })
    if (error) {
      console.error('[servers] search query failed', error)
      throw new Error(`Servers search query failed: ${error.message}`)
    }
    // A null payload with no error used to render as a silently empty page;
    // caching would pin that empty result set for the full TTL.
    if (!data) throw new Error('Servers search query returned no data')

    const results = data as Server[]
    const hasNextPage = results.length > ITEMS_PER_PAGE
    const page = results.slice(0, ITEMS_PER_PAGE)
    // Approximate total for search: show current offset + results fetched
    const totalCount = hasNextPage
      ? p.offset + ITEMS_PER_PAGE + 1
      : p.offset + page.length
    // `search_servers` is `returns setof servers`, so its rows carry EVERY
    // column (submitted_by/claimed_by/fts included) and no `.select()`
    // allow-list applies to an RPC. Project before anything caches them (S30).
    return {
      servers: projectFields(
        page as unknown as Record<string, unknown>[],
        PUBLIC_CARD_FIELD_LIST,
      ) as unknown as Server[],
      totalCount,
    }
  }

  // Direct query — hide archived by default
  // `estimated` (planner row-count), NOT `exact`: an exact window-count over
  // the ~46k-row servers table exceeds anon's 3s statement timeout, which
  // returned `canceling statement due to statement timeout` and rendered an
  // empty "No servers found" catalog. An approximate total is fine for paging.
  let query = supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS, { count: 'estimated' })
    .eq('is_archived', false)

  if (p.category) query = query.contains('categories', [p.category])
  if (p.status) query = query.eq('health_status', p.status)
  if (p.pricing) query = query.eq('api_pricing', p.pricing)
  if (p.author) query = query.eq('author_type', p.author)
  if (p.transport) query = query.contains('transport', [p.transport])
  if (p.minScore > 0) query = query.gte('score_total', p.minScore)

  switch (p.sort) {
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

  query = query.range(p.offset, p.offset + ITEMS_PER_PAGE - 1)

  const { data, count, error } = await query
  if (error) {
    console.error('[servers] catalog query failed', error)
    throw new Error(`Servers catalog query failed: ${error.message}`)
  }
  return { servers: (data as Server[]) || [], totalCount: count || 0 }
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
  const minScore = parseInt(params.min_score || '0', 10)
  const page = parsePage(params.page)
  if (page > MAX_PAGE) notFound()
  const offset = (page - 1) * ITEMS_PER_PAGE

  const supabase = createPublicClient()

  // Start the shared home_stats snapshot now so it overlaps the listing query
  // below instead of costing a second serial round trip (it is awaited after
  // the branch). `supabase.rpc()` is lazy — the request only fires when the
  // builder is `then`-ed — so wrap it to kick it off here.
  const statsPromise = Promise.resolve(supabase.rpc('home_stats'))

  // An out-of-range filter value (`?status=zzz`) matches zero rows by
  // construction, so it falls through with the zero defaults: no DB round trip,
  // `loadFailed` stays false, and the "No servers found" panel below renders —
  // the same output the live query produced.
  const normalized = normalizeServersQuery(params, offset)

  // Degrade instead of 500ing: the fetch THROWS on a Supabase error (the 3s
  // statement timeout during the S20 outage) so nothing hollow is ever cached,
  // and the "try again" panel below renders instead of an error page.
  let servers: Server[] = []
  let totalCount = 0
  let loadFailed = false
  if (normalized.kind === 'query') {
    try {
      const listing = await fetchServersListing(normalized.params)
      servers = listing.servers
      totalCount = listing.totalCount
    } catch (err) {
      console.error('[servers] listing unavailable — rendering degraded', err)
      loadFailed = true
    }
  }

  // Clamped to MAX_PAGE so "Next" never links to a page that now 404s.
  const totalPages = Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), MAX_PAGE)

  // Canonical catalog total. The homepage hero reads `total_servers` from the
  // daily home_stats snapshot; if the unfiltered /servers view used its own
  // live count instead, the two numbers would drift apart between refreshes
  // (and badly whenever compute-scores fails to refresh the snapshot). Source
  // the catalog headline from the SAME snapshot so the numbers always agree.
  // The live `totalCount` above still drives pagination and filtered/search
  // result counts, which must stay exact.
  const { data: statsData } = await statsPromise
  const catalogTotal =
    (statsData as { total_servers?: number } | null)?.total_servers ?? totalCount

  const hasFilters = Boolean(
    q || category || status || pricing || author || transport || minScore > 0,
  )
  // Filtered/search views show the live filtered count; the plain catalog view
  // shows the shared snapshot total.
  const headerTotal = hasFilters ? totalCount : catalogTotal

  // Build full structured-data set on the canonical landing (page 1, no query).
  // Filtered/paginated views canonicalize to /servers, so emitting schema there
  // would just duplicate signals.
  const isCanonicalView = !q && page === 1 && !category && !status && !pricing
  const jsonLd = isCanonicalView
    ? [
        generateCollectionJsonLd(
          'MCP Server Directory',
          `Browse ${catalogTotal.toLocaleString()}+ Model Context Protocol servers, scored on security, maintenance, documentation, compatibility, and token efficiency.`,
          `${SITE_URL}/servers`,
        ),
        generateBreadcrumbJsonLd([
          { name: 'MCPpedia', url: SITE_URL },
          { name: 'All servers', url: `${SITE_URL}/servers` },
        ]),
        ...(servers.length > 0
          ? [
              generateItemListJsonLd(
                servers.slice(0, 20).map(s => ({
                  name: `${s.name} MCP Server`,
                  url: `${SITE_URL}/s/${s.slug}`,
                  description: s.tagline || s.description || undefined,
                })),
              ),
            ]
          : []),
      ]
    : null

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {jsonLd && <JsonLdScript data={jsonLd} />}
      <div className="mb-6">
        <SearchBar
          placeholder={`Search ${catalogTotal.toLocaleString()}+ MCP servers...`}
          large
        />
      </div>

      <div className="mb-4">
        <FilterBar />
      </div>

      <div className="mb-4">
        <ScoreFilterPills />
      </div>

      {/* A failed query leaves totalCount at 0 — suppress the count line rather
          than contradict the degraded state below with `0 servers matching`. */}
      {!loadFailed && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-text-muted">
            {q
              ? `${totalCount.toLocaleString()} server${totalCount !== 1 ? 's' : ''} matching "${q}"`
              : `${headerTotal.toLocaleString()} servers`
            }
          </p>
        </div>
      )}

      <div className="space-y-3">
        {servers.map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {/* A failed query and a genuinely empty result look identical in the data
          (both give zero rows) but mean opposite things to the reader — say
          which one happened instead of claiming the catalog is empty. */}
      {loadFailed && (
        <div className="text-center py-12">
          <div className="flex justify-center mb-3">
            <BlinkLogo size={48} className="text-text-muted" />
          </div>
          <p className="text-text-muted mb-2">
            We couldn&apos;t load the catalog right now. Please try again in a moment.
          </p>
          <Link href="/servers" className="text-sm text-accent hover:text-accent-hover">
            Retry &rarr;
          </Link>
        </div>
      )}

      {!loadFailed && servers.length === 0 && (
        <div className="text-center py-12">
          <div className="flex justify-center mb-3">
            <BlinkLogo size={48} className="text-text-muted" />
          </div>
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
