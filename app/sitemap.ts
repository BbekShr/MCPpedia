import { CATEGORIES, SITE_URL } from '@/lib/constants'
import { getAllBlogPosts } from '@/lib/blog'
import { getAllGuides } from '@/lib/mdx'
import type { MetadataRoute } from 'next'
import fs from 'fs'
import path from 'path'

export const revalidate = 86400 // 24h — crawlers re-read once per day

/**
 * Fetch ALL non-archived servers by paginating through Supabase
 * (default limit is 1,000 rows per query).
 */
async function getAllServers(supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>) {
  const PAGE_SIZE = 1000
  const allServers: { slug: string; updated_at: string }[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data } = await supabase
      .from('servers')
      .select('slug, updated_at')
      .eq('is_archived', false)
      .order('score_total', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (data && data.length > 0) {
      allServers.push(...data)
      offset += PAGE_SIZE
      hasMore = data.length === PAGE_SIZE
    } else {
      hasMore = false
    }
  }

  return allServers
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [{ url: SITE_URL }]
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient('sitemap')

  // Fetch ALL servers (paginated to bypass 1,000 row default)
  const servers = await getAllServers(supabase)

  const serverEntries: MetadataRoute.Sitemap = servers.map(s => ({
    url: `${SITE_URL}/s/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map(c => ({
    url: `${SITE_URL}/category/${c}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const guideEntries: MetadataRoute.Sitemap = getAllGuides().map(g => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: g.date ? new Date(g.date) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const bestForEntries: MetadataRoute.Sitemap = [
    'developers', 'data-engineering', 'productivity',
    'ai-agents', 'cloud-infrastructure', 'security',
    'web-scraping', 'file-management', 'monitoring',
    'communication', 'databases', 'design-tools',
  ].map(slug => ({
    url: `${SITE_URL}/best-for/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const staticPages: MetadataRoute.Sitemap = [
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
  ]

  const blogEntries: MetadataRoute.Sitemap = getAllBlogPosts().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // Comparison pages from generated pairs
  let comparisonEntries: MetadataRoute.Sitemap = []
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
    ...serverEntries,
    ...categoryEntries,
    ...guideEntries,
    ...bestForEntries,
    ...blogEntries,
    ...comparisonEntries,
  ]
}
