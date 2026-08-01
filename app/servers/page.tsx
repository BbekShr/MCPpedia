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
import {
  first,
  isCacheableQuery,
  normalizeServersQuery,
  type ServersListingParams,
} from '@/lib/servers-query'
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
import { unstable_cache } from 'next/cache'
import { withDeadline, withRetry } from '@/lib/retry'
import BlinkLogo from '@/components/BlinkLogo'

// Cap the reachable offset at the same 10k the public API uses
// (app/api/v1/servers/route.ts:10). Past it Postgres has to walk the whole
// ordered set, which blows anon's 3s statement timeout — and the error path
// below then rendered a 200-OK "No servers found" catalog with the pagination
// hidden, i.e. a silently empty encyclopedia. Nothing legitimate browses that
// deep, so a page beyond the cap 404s instead of running the query.
const MAX_OFFSET = 10_000
const MAX_PAGE = Math.floor(MAX_OFFSET / ITEMS_PER_PAGE)

function parsePage(raw: string | string[] | undefined): number {
  const n = parseInt(first(raw) || '1', 10)
  return Number.isNaN(n) || n < 1 ? 1 : n
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
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

// Total wall-clock budget for the listing, retries included. This page has an
// `app/servers/loading.tsx`, so Next commits a 200 + skeleton and STREAMS the
// rest: an overrun is not a 504 the user can retry but a stream cut mid-flight,
// leaving an animated skeleton forever — `app/error.tsx` cannot fire once the
// shell has streamed. So the budget has to expire well inside the platform's
// function limit and hand control back to the degraded panel below, which is
// the whole point of the throw-and-degrade contract.
//
// Anon's statement timeout is 3s, so the retry count is 1 (two attempts), not
// `withRetry`'s default 3: four attempts would both blow the budget above and
// amplify 4x load into the saturated database the retries are reacting to.
const LISTING_BUDGET_MS = 6000
// home_stats degrades SOFTLY (it only costs the headline number), so it gets a
// tighter budget than the listing it runs alongside.
const STATS_BUDGET_MS = 4000

// The single place the retry/deadline envelope is defined, so the cached and
// uncached paths below cannot drift apart.
function fetchServersListingBounded(
  p: ServersListingParams,
): Promise<{ servers: Server[]; totalCount: number }> {
  // Deadline OUTSIDE the retry (lib/retry.ts:23) — inside, it multiplies.
  return withDeadline(
    withRetry(() => fetchServersListing(p), { retries: 1 }),
    LISTING_BUDGET_MS,
    'servers listing',
  )
}

// Cache the listing round-trip for 1h. This page awaits `searchParams`, so it
// is fully dynamic and a route-level `revalidate` export never applies — that
// is why the `export const revalidate = 60` that used to sit above was inert
// and every crawler hit ran a live anon query against the 3s statement timeout.
//
// `unstable_cache` keys on the stringified argument object in addition to the
// key prefix below, so that SINGLE object must carry every input that changes
// the result set. Adding a filter to the fetch without adding it to
// `ServersListingParams` would serve one filter's results for another.
//
// Unlike /category/[category], the argument is normalized through
// lib/servers-query.ts first: this page reads nine params, five of them
// free-form, and an unvalidated tail would let a crawler mint unbounded cache
// entries — defeating the cache in exactly the scenario it exists for. That
// normalization is necessary but NOT sufficient, which is why the call site
// gates on `isCacheableQuery`: only bounded, repeat-prone shapes come through
// here at all. Anything else goes straight to `fetchServersListingBounded`,
// issuing no cache read and no cache write.
//
// Throwing inside the cached function is what stops a transient Supabase blip
// from pinning an empty catalog for the full hour (unstable_cache stores only
// successful returns), and withRetry absorbs a one-off failure before the
// caller degrades.
//
// Invalidation is TIME-BASED ONLY. `revalidateTag` is called nowhere in this
// repo — the tag below exists for a future on-demand path; today the only
// refresh is the 1h TTL. Cost of that: the header count and `totalPages` can
// lag reality by up to an hour.
const getServersListing = unstable_cache(
  (params: ServersListingParams) => fetchServersListingBounded(params),
  ['servers-page-listing-v1'],
  { revalidate: 3600, tags: ['servers-listing'] },
)

// Zero arguments, so ONE entry serves every filter/sort/page permutation — the
// largest per-request win on this page.
//
// 1h, NOT the 24h / (app/page.tsx) and /security (app/security/page.tsx) use.
// The snapshot itself is shared, but each page reads it through its OWN
// `unstable_cache` entry with its own independent window, so the three pages
// can disagree by up to their respective TTLs: the snapshot bot bumps the total
// at ~08:30, and whichever entry was populated just before that keeps serving
// the old number until it expires. A 1h TTL bounds this page's share of that
// skew to an hour without meaningfully changing the query volume (one call per
// hour).
const getServersCatalogStats = unstable_cache(
  () =>
    withDeadline(
      withRetry(async () => {
        const supabase = createPublicClient()
        const { data, error } = await supabase.rpc('home_stats')
        if (error || !data) {
          console.error('[servers] home_stats failed — refusing to cache', error)
          throw new Error(`home_stats failed: ${error?.message || 'no data'}`)
        }
        // `home_stats()` returns a single jsonb object, never a set.
        return data as { total_servers?: number }
      }, { retries: 1 }),
      STATS_BUDGET_MS,
      'servers home_stats',
    ),
  ['servers-page-stats-v1'],
  { revalidate: 3600, tags: ['home-stats'] },
)

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
  // Same contract as the search branch above: unreachable today (a `.select()`
  // yields `[]`, not null) but the two branches must not disagree on it, and
  // this is the one serving the canonical /servers landing page.
  if (!data) throw new Error('Servers catalog query returned no data')
  return { servers: data as Server[], totalCount: count || 0 }
}

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // Every read goes through `first` — Next types a repeated key (`?q=a&q=b`)
  // as `string[]`, and the array used to travel all the way into the RPC's
  // `text` `search_query` parameter and error there. See lib/servers-query.ts.
  const q = first(params.q) || ''
  const category = first(params.category) || ''
  const status = first(params.status) || ''
  const pricing = first(params.pricing) || ''
  const author = first(params.author) || ''
  const transport = first(params.transport) || ''
  const minScore = parseInt(first(params.min_score) || '0', 10)
  const page = parsePage(params.page)
  if (page > MAX_PAGE) notFound()
  const offset = (page - 1) * ITEMS_PER_PAGE

  // The Prev/Next links rebuild the query string from `params`, so collapse
  // repeated keys here too — a raw `string[]` would stringify as `a,b` and
  // hand the next page a value neither `first` nor the filters recognize.
  const linkParams: Record<string, string> = Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const single = first(value)
      return single === undefined ? [] : [[key, single] as [string, string]]
    }),
  )

  // Start the shared home_stats snapshot now so it overlaps the listing fetch
  // below instead of costing a second serial round trip (it is awaited after
  // the branch). Unlike the listing, this one degrades SOFTLY: a missing
  // snapshot only costs the headline number, so fall back to the live count
  // rather than rendering the whole catalog as failed.
  const statsPromise = getServersCatalogStats().catch(err => {
    console.error('[servers] home_stats unavailable — falling back to the live count', err)
    return null
  })

  // An out-of-range filter value (`?status=zzz`) matches zero rows by
  // construction, so it falls through with the zero defaults: no DB round trip,
  // `loadFailed` stays false, and the "No servers found" panel below renders.
  // Not byte-identical to what the live query produced — `count: 'estimated'`
  // is a PLANNER ESTIMATE, so the filtered zero-row query could still report a
  // nonzero total and render a phantom header count with a live pagination
  // block above an empty list. The short-circuit drops both. A small
  // improvement, not a no-op.
  const normalized = normalizeServersQuery(params, offset)

  // Degrade instead of 500ing: the fetch THROWS on a Supabase error (the 3s
  // statement timeout during the S20 outage) so nothing hollow is ever cached,
  // and the "try again" panel below renders instead of an error page.
  let servers: Server[] = []
  let totalCount = 0
  let loadFailed = false
  if (normalized.kind === 'query') {
    try {
      const p = normalized.params
      // Only bounded, repeat-prone shapes touch the Data Cache at all; the rest
      // run live on the identical retry/deadline envelope (isCacheableQuery in
      // lib/servers-query.ts explains which and why).
      const listing = isCacheableQuery(p)
        ? await getServersListing(p)
        : await fetchServersListingBounded(p)
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
  // the catalog headline from the SAME snapshot instead.
  // Same snapshot, but each page reads it through its OWN `unstable_cache`
  // entry on an independent window, so the numbers can still differ by up to
  // those TTLs — bounded to 1h here, 24h on / and /security. The live
  // `totalCount` above still drives pagination and filtered/search result
  // counts, which must stay exact.
  const statsData = await statsPromise
  const catalogTotal = statsData?.total_servers ?? totalCount

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
              href={`/servers?${new URLSearchParams({ ...linkParams, page: String(page - 1) }).toString()}`}
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
              href={`/servers?${new URLSearchParams({ ...linkParams, page: String(page + 1) }).toString()}`}
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
