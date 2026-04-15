import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import ServerCard from '@/components/ServerCard'
import CategoryFilters from '@/components/CategoryFilters'
import ScoreBadge from '@/components/ScoreBadge'
import { CATEGORIES, CATEGORY_LABELS, ITEMS_PER_PAGE, SITE_URL, PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import { JsonLdScript, generateCollectionJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo'
import type { Server } from '@/lib/types'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 86400

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
    alternates: {
      canonical: `${SITE_URL}/category/${category}`,
    },
  }
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

  const supabase = createPublicClient()

  let query = supabase
    .from('servers')
    .select(PUBLIC_SERVER_FIELDS, { count: 'exact' })
    .contains('categories', [category])
    .eq('is_archived', false)

  // Apply filters
  if (status) query = query.eq('health_status', status)
  if (transport) query = query.contains('transport', [transport])
  if (minScore > 0) query = query.gte('score_total', minScore)
  if (q) {
    // Simple text filter — matches name or tagline
    query = query.or(`name.ilike.%${q}%,tagline.ilike.%${q}%`)
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

  const { data: servers, count } = await query
  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Calculate category stats for the header
  const hasFilters = status || transport || minScore > 0 || q

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
        {hasFilters
          ? `${totalCount.toLocaleString()} server${totalCount !== 1 ? 's' : ''} matching your filters`
          : `${totalCount.toLocaleString()} server${totalCount !== 1 ? 's' : ''} in this category`
        }
      </p>

      {/* Filters */}
      <div className="mb-6">
        <CategoryFilters />
      </div>

      {/* Results */}
      <div className="space-y-3">
        {(servers as Server[] || []).map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {(!servers || servers.length === 0) && (
        <div className="text-center py-12">
          <p className="text-text-muted mb-2">
            {hasFilters
              ? 'No servers match your filters.'
              : 'No servers in this category yet.'
            }
          </p>
          {hasFilters && (
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
