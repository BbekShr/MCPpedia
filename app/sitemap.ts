import { CATEGORIES, SITE_URL } from '@/lib/constants'
import { getAllBlogPosts } from '@/lib/blog'
import { getAllGuides } from '@/lib/mdx'
import type { MetadataRoute } from 'next'
import fs from 'fs'
import path from 'path'

// Each sitemap chunk holds up to 5,000 URLs (well under Google's 50k limit).
// Chunk 0 = static pages + categories + guides + blog + comparisons + best-for
// Chunks 1+ = server pages, 5,000 per chunk
const SERVERS_PER_CHUNK = 5000

async function getSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

async function getTotalServerCount(): Promise<number> {
  const supabase = await getSupabase()
  if (!supabase) return 0
  const { count } = await supabase
    .from('servers')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)
  return count || 0
}

export async function generateSitemaps() {
  const total = await getTotalServerCount()
  const serverChunks = Math.ceil(total / SERVERS_PER_CHUNK)
  // Chunk 0 = static/misc pages, chunks 1..N = server pages
  const ids = [{ id: 0 }]
  for (let i = 1; i <= serverChunks; i++) {
    ids.push({ id: i })
  }
  return ids
}

export default async function sitemap(props: {
  id: Promise<string>
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id)

  // Chunk 0: static pages, categories, guides, blog, best-for, comparisons
  if (id === 0) {
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
    ]

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

    const blogEntries: MetadataRoute.Sitemap = getAllBlogPosts().map(post => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

    // Comparison pages
    let comparisonEntries: MetadataRoute.Sitemap = []
    try {
      const pairsPath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
      const pairsRaw = fs.readFileSync(pairsPath, 'utf-8')
      const pairsData = JSON.parse(pairsRaw)
      comparisonEntries = [
        { url: `${SITE_URL}/compare`, changeFrequency: 'weekly', priority: 0.6 },
        ...(pairsData.pairs || []).map((p: { slugA: string; slugB: string }) => ({
          url: `${SITE_URL}/compare/${p.slugA}-vs-${p.slugB}`,
          changeFrequency: 'monthly' as const,
          priority: 0.5,
        })),
      ]
    } catch {
      comparisonEntries = [
        { url: `${SITE_URL}/compare`, changeFrequency: 'weekly', priority: 0.6 },
      ]
    }

    return [...staticPages, ...categoryEntries, ...guideEntries, ...bestForEntries, ...blogEntries, ...comparisonEntries]
  }

  // Chunks 1+: server pages, paginated
  const supabase = await getSupabase()
  if (!supabase) return []

  const offset = (id - 1) * SERVERS_PER_CHUNK
  const { data: servers } = await supabase
    .from('servers')
    .select('slug, updated_at')
    .eq('is_archived', false)
    .order('score_total', { ascending: false })
    .range(offset, offset + SERVERS_PER_CHUNK - 1)

  return (servers || []).map(s => ({
    url: `${SITE_URL}/s/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
}
