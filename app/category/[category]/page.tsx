import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { withRetry } from '@/lib/retry'
import ServerCard from '@/components/ServerCard'
import CategoryFilters from '@/components/CategoryFilters'
import { CATEGORIES, CATEGORY_LABELS, ITEMS_PER_PAGE, SITE_URL, PUBLIC_CARD_FIELDS } from '@/lib/constants'
import { sanitizeSearchQuery } from '@/lib/validators'
import { JsonLdScript, generateCollectionJsonLd, generateBreadcrumbJsonLd, generateItemListJsonLd } from '@/lib/seo'
import { getHubAggregates, buildHubIntro } from '@/lib/hub-intro'
import { normalizeServerName } from '@/lib/server-name'
import HubIntro from '@/components/HubIntro'
import type { Server } from '@/lib/types'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 604800 // 7d

export async function generateStaticParams() {
  return CATEGORIES.map(c => ({ category: c }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  const label = CATEGORY_LABELS[category as Category]
  if (!label) return { title: 'Category Not Found' }

  const description = `Browse the best ${label.toLowerCase()} MCP servers. Find tools for ${label.toLowerCase()} on MCPpedia.`
  return {
    title: `${label} MCP Servers`,
    description,
    openGraph: {
      title: `${label} MCP Servers`,
      description,
      type: 'website',
      url: `${SITE_URL}/category/${category}`,
    },
    twitter: {
      card: 'summary_large_image',
      site: '@MCPpedia',
      creator: '@MCPpedia',
      title: `${label} MCP Servers`,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/category/${category}`,
    },
  }
}

type CategoryListingParams = {
  category: string
  sort: string
  status: string
  transport: string
  minScore: number
  q: string
  offset: number
}

// Cache the listing round-trip for 1h. This page reads `searchParams`, so it is
// dynamic and the route-level `revalidate` above never applies — without this,
// every crawler hit of the 22 sitemap-listed categories (and every ?sort/?page
// permutation) ran a live anon query against the 3s statement timeout.
//
// `unstable_cache` keys on the stringified arguments in addition to the key
// prefix below, so the SINGLE argument object must carry every input that
// changes the result set: category, sort, status, transport, minScore, q and
// offset (the page number, already folded into offset). Adding a new filter
// above without adding it here would serve one filter's results for another.
//
// Bust on demand with `revalidateTag('category-listing')`. Throwing inside the
// cached function (below) is what stops a transient Supabase blip from pinning
// an empty listing for the full hour — unstable_cache only caches successful
// returns, and withRetry absorbs a one-off failure before the caller degrades.
const getCategoryListing = unstable_cache(
  (params: CategoryListingParams) => withRetry(() => fetchCategoryListing(params)),
  ['category-page-listing-v1'],
  { revalidate: 3600, tags: ['category-listing'] },
)

async function fetchCategoryListing({
  category,
  sort,
  status,
  transport,
  minScore,
  q,
  offset,
}: CategoryListingParams): Promise<{ servers: Server[]; totalCount: number }> {
  const supabase = createPublicClient()

  // `estimated`, NOT `exact`: an exact window-count on large categories
  // (e.g. developer-tools, 6k+ rows) exceeds anon's 3s statement timeout —
  // the error guard below then throws and the page renders degraded. An
  // approximate total is fine for paging; the timeout is what breaks the page.
  let query = supabase
    .from('servers')
    .select(PUBLIC_CARD_FIELDS, { count: 'estimated' })
    .contains('categories', [category])
    .eq('is_archived', false)

  // Apply filters
  if (status) query = query.eq('health_status', status)
  if (transport) query = query.contains('transport', [transport])
  if (minScore > 0) query = query.gte('score_total', minScore)
  if (q) {
    const safe = sanitizeSearchQuery(q)
    if (safe) query = query.or(`name.ilike.%${safe}%,tagline.ilike.%${safe}%`)
  }

  // Sort
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
      query = query.order('score_total', { ascending: false })
  }

  query = query.range(offset, offset + ITEMS_PER_PAGE - 1)

  const { data, count, error } = await query
  if (error) {
    console.error(`[category/${category}] Supabase query failed`, error)
    throw new Error(`Category page query failed: ${error.message}`)
  }
  return { servers: (data as Server[]) || [], totalCount: count || 0 }
}

function hasFiltersFor({ status, transport, minScore, q }: { status: string; transport: string; minScore: number; q: string }): boolean {
  return Boolean(status || transport || minScore > 0 || q)
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { category } = await params
  const sp = await searchParams

  if (!CATEGORIES.includes(category as Category)) notFound()

  const label = CATEGORY_LABELS[category as Category]
  const sort = sp.sort || 'score'
  const status = sp.status || ''
  const transport = sp.transport || ''
  const minScore = parseInt(sp.min_score || '0', 10)
  const q = sp.q || ''
  const page = parseInt(sp.page || '1', 10)
  const offset = (page - 1) * ITEMS_PER_PAGE

  // Degrade instead of 500ing: a persistent query failure (the 3s statement
  // timeout during the S20 outage) renders an explicit "try again" state rather
  // than an error page. Nothing failed gets cached — fetchCategoryListing
  // throws, so unstable_cache stores nothing and the next request retries.
  let servers: Server[] = []
  let totalCount = 0
  let loadFailed = false
  try {
    const listing = await getCategoryListing({ category, sort, status, transport, minScore, q, offset })
    servers = listing.servers
    totalCount = listing.totalCount
  } catch (err) {
    console.error(`[category/${category}] listing unavailable — rendering degraded`, err)
    loadFailed = true
  }

  // Intro copy is only meaningful for the unfiltered, first-page view — that is
  // the URL in the sitemap and the one a crawler lands on. A filtered permutation
  // gets the list without the prose rather than prose describing the wrong set.
  const isCanonicalView = !hasFiltersFor({ status, transport, minScore, q }) && page === 1
  const agg = isCanonicalView ? await getHubAggregates([category]) : null
  const intro = agg
    ? buildHubIntro({
        subject: `${label.toLowerCase()} MCP servers`,
        agg,
        leaders: servers.slice(0, 3).map(s => ({
          name: normalizeServerName(s.name),
          slug: s.slug,
          score: s.score_total ?? 0,
        })),
      })
    : []

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Calculate category stats for the header
  const hasFilters = hasFiltersFor({ status, transport, minScore, q })

  // Build pagination URL helper
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (sort && sort !== 'score') params.set('sort', sort)
    if (status) params.set('status', status)
    if (transport) params.set('transport', transport)
    if (minScore > 0) params.set('min_score', String(minScore))
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/category/${category}${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <JsonLdScript data={[
        generateCollectionJsonLd(`${label} MCP Servers`, `Browse the best ${label.toLowerCase()} MCP servers on MCPpedia.`, `${SITE_URL}/category/${category}`),
        generateBreadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: 'Categories', url: `${SITE_URL}/servers` },
          { name: label, url: `${SITE_URL}/category/${category}` },
        ]),
        // The list itself, so the ranking is machine-readable rather than being
        // implied by card markup. Only on the canonical unfiltered view — a
        // filtered permutation would publish a different list under the same
        // canonical URL.
        ...(isCanonicalView && servers.length > 0
          ? [generateItemListJsonLd(servers.map(s => ({
              name: `${normalizeServerName(s.name)} MCP Server`,
              url: `${SITE_URL}/s/${s.slug}`,
              description: s.tagline || undefined,
            })))]
          : []),
      ]} />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted mb-6">
        <Link href="/" className="hover:text-accent transition-colors">Home</Link>
        <span className="text-text-muted/50">/</span>
        <Link href="/servers" className="hover:text-accent transition-colors">Servers</Link>
        <span className="text-text-muted/50">/</span>
        <span className="text-text-primary font-medium">{label}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-text-primary mb-2">{label} MCP Servers</h1>
      <p className="text-text-muted mb-6">
        {loadFailed
          ? 'Server list temporarily unavailable'
          : hasFilters
            ? `${totalCount.toLocaleString()} server${totalCount !== 1 ? 's' : ''} matching your filters`
            : `${totalCount.toLocaleString()} server${totalCount !== 1 ? 's' : ''} in this category`
        }
      </p>

      {intro.length > 0 && (
        <HubIntro
          paragraphs={intro}
          updatedAt={new Date()}
          siblingsLabel="Also see"
          siblings={[
            { label: `Best ${label} MCP servers`, href: `/best/${category}` },
            ...CATEGORIES.filter(c => c !== category).slice(0, 4).map(c => ({
              label: CATEGORY_LABELS[c as Category],
              href: `/category/${c}`,
            })),
          ]}
        />
      )}

      {/* Filters */}
      <div className="mb-6">
        <CategoryFilters />
      </div>

      {/* Results */}
      <div className="space-y-3">
        {servers.map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted mb-2">
            {loadFailed
              ? "We couldn't load this category right now. Please try again in a moment."
              : hasFilters
                ? 'No servers match your filters.'
                : 'No servers in this category yet.'
            }
          </p>
          {!loadFailed && hasFilters && (
            <Link href={`/category/${category}`} className="text-sm text-accent hover:text-accent-hover">
              Clear all filters &rarr;
            </Link>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-muted hover:text-text-primary min-h-[36px] flex items-center"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-muted hover:text-text-primary min-h-[36px] flex items-center"
            >
              Next
            </Link>
          )}
        </div>
      )}

      {/* Related categories */}
      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Browse other categories</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.filter(c => c !== category).slice(0, 12).map(cat => (
            <Link
              key={cat}
              href={`/category/${cat}`}
              className="px-3 py-1.5 text-sm rounded-full border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors min-h-[36px] flex items-center"
            >
              {CATEGORY_LABELS[cat as Category]}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
