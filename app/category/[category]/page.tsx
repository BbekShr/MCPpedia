import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import { CATEGORIES, CATEGORY_LABELS, ITEMS_PER_PAGE, SITE_NAME, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateCollectionJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo'
import type { Server } from '@/lib/types'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 60

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
    title: `${label} MCP Servers - ${SITE_NAME}`,
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
  const sort = sp.sort || 'stars'
  const page = parseInt(sp.page || '1', 10)
  const offset = (page - 1) * ITEMS_PER_PAGE

  const supabase = await createClient()

  let query = supabase
    .from('servers')
    .select('*', { count: 'exact' })
    .contains('categories', [category])

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
    default:
      query = query.order('github_stars', { ascending: false })
  }

  query = query.range(offset, offset + ITEMS_PER_PAGE - 1)

  const { data: servers, count } = await query
  const totalPages = Math.ceil((count || 0) / ITEMS_PER_PAGE)

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <JsonLdScript data={[
        generateCollectionJsonLd(`${label} MCP Servers`, `Browse the best ${label.toLowerCase()} MCP servers on MCPpedia.`, `${SITE_URL}/category/${category}`),
        generateBreadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: label, url: `${SITE_URL}/category/${category}` },
        ]),
      ]} />
      <h1 className="text-2xl font-semibold text-text-primary mb-2">{label} MCP Servers</h1>
      <p className="text-text-muted mb-6">{count || 0} servers in this category</p>

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <span className="text-text-muted">Sort:</span>
        {['stars', 'newest', 'name'].map(s => (
          <Link
            key={s}
            href={`/category/${category}?sort=${s}`}
            className={`px-2 py-1 rounded ${sort === s ? 'bg-bg-tertiary text-text-primary font-medium' : 'text-text-muted hover:text-text-primary'}`}
          >
            {s === 'stars' ? 'Most Stars' : s === 'newest' ? 'Newest' : 'Name'}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {(servers as Server[] || []).map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {(!servers || servers.length === 0) && (
        <p className="text-text-muted text-sm">No servers in this category yet.</p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/category/${category}?sort=${sort}&page=${page - 1}`}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-muted hover:text-text-primary"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link
              href={`/category/${category}?sort=${sort}&page=${page + 1}`}
              className="px-3 py-1.5 text-sm border border-border rounded-md text-text-muted hover:text-text-primary"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
