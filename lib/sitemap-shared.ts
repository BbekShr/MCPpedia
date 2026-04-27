import { CATEGORIES, SITE_URL } from './constants'
import { getAllBlogPosts } from './blog'
import { getAllGuides } from './mdx'
import { getAllSkills } from './skills'
import fs from 'fs'
import path from 'path'

export const SERVER_CHUNK_SIZE = 10000

export interface SitemapEntry {
  url: string
  lastModified?: Date | string
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

// Render <urlset> XML from entries (matches Next.js MetadataRoute.Sitemap output).
export function renderUrlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map(e => {
      const lm = e.lastModified
        ? `<lastmod>${typeof e.lastModified === 'string' ? e.lastModified : e.lastModified.toISOString()}</lastmod>`
        : ''
      const cf = e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : ''
      const pr = e.priority !== undefined ? `<priority>${e.priority}</priority>` : ''
      return `<url><loc>${escapeXml(e.url)}</loc>${lm}${cf}${pr}</url>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
}

export function renderSitemapIndex(sitemaps: { loc: string; lastmod?: string }[]): string {
  const items = sitemaps
    .map(s => `<sitemap><loc>${escapeXml(s.loc)}</loc>${s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : ''}</sitemap>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
} as const

// Static + categories + best-for + blog + guides + skills + comparisons.
export function buildStaticEntries(): SitemapEntry[] {
  const staticPages: SitemapEntry[] = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/servers`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/submit`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/guides`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/badge`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/analytics`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${SITE_URL}/security`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/get-started`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/compare`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/skills`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/methodology`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const categoryEntries: SitemapEntry[] = CATEGORIES.map(c => ({
    url: `${SITE_URL}/category/${c}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const bestForEntries: SitemapEntry[] = [
    'developers', 'data-engineering', 'productivity',
    'ai-agents', 'cloud-infrastructure', 'security',
    'web-scraping', 'file-management', 'monitoring',
    'communication', 'databases', 'design-tools',
  ].map(slug => ({
    url: `${SITE_URL}/best-for/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const guideEntries: SitemapEntry[] = getAllGuides().map(g => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: g.date ? new Date(g.date) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const blogEntries: SitemapEntry[] = getAllBlogPosts().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const skillEntries: SitemapEntry[] = getAllSkills().map(s => ({
    url: `${SITE_URL}/skills/${s.slug}`,
    lastModified: s.last_updated ? new Date(s.last_updated) : undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  let comparisonEntries: SitemapEntry[] = []
  try {
    const pairsPath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
    const pairsRaw = fs.readFileSync(pairsPath, 'utf-8')
    const pairsData = JSON.parse(pairsRaw)
    comparisonEntries = (pairsData.pairs || []).map((p: { slugA: string; slugB: string }) => ({
      url: `${SITE_URL}/compare/${p.slugA}-vs-${p.slugB}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))
  } catch {
    // No pairs file yet
  }

  return [
    ...staticPages,
    ...categoryEntries,
    ...bestForEntries,
    ...guideEntries,
    ...blogEntries,
    ...skillEntries,
    ...comparisonEntries,
  ]
}

// Fetch a chunk of servers ordered by score_total descending.
// Higher-scored servers go in chunk 0 so Google's first-pass crawl prioritizes
// the better content. Paginated through Supabase to bypass the default 1k limit.
export async function fetchServerChunk(chunkIndex: number): Promise<SitemapEntry[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return []
  }
  const { createAdminClient } = await import('./supabase/admin')
  const supabase = createAdminClient('sitemap')

  const startOffset = chunkIndex * SERVER_CHUNK_SIZE
  const endOffset = startOffset + SERVER_CHUNK_SIZE - 1

  const PAGE = 1000
  const out: SitemapEntry[] = []
  let offset = startOffset
  while (offset <= endOffset) {
    const upper = Math.min(offset + PAGE - 1, endOffset)
    const { data } = await supabase
      .from('servers')
      .select('slug, updated_at')
      .eq('is_archived', false)
      .order('score_total', { ascending: false, nullsFirst: false })
      .order('slug', { ascending: true })
      .range(offset, upper)

    if (!data || data.length === 0) break

    for (const s of data) {
      out.push({
        url: `${SITE_URL}/s/${s.slug}`,
        lastModified: new Date(s.updated_at),
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
    if (data.length < PAGE) break
    offset += data.length
  }
  return out
}
