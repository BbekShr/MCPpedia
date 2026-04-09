import { CATEGORIES, SITE_URL } from '@/lib/constants'
import { getAllBlogPosts } from '@/lib/blog'
import { getAllGuides } from '@/lib/mdx'
import type { MetadataRoute } from 'next'
import fs from 'fs'
import path from 'path'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [{ url: SITE_URL }]
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  const { data: servers } = await supabase
    .from('servers')
    .select('slug, updated_at')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  const serverEntries = (servers || []).map(s => ({
    url: `${SITE_URL}/s/${s.slug}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const categoryEntries = CATEGORIES.map(c => ({
    url: `${SITE_URL}/category/${c}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const guideEntries = getAllGuides().map(g => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: g.date ? new Date(g.date) : undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  const bestForEntries = [
    'developers', 'data-engineering', 'productivity',
    'ai-agents', 'cloud-infrastructure', 'security',
    'web-scraping', 'file-management', 'monitoring',
    'communication', 'databases', 'design-tools',
  ].map(slug => ({
    url: `${SITE_URL}/best-for/${slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const staticPages = [
    { url: SITE_URL, changeFrequency: 'daily' as const, priority: 1.0 },
    { url: `${SITE_URL}/servers`, changeFrequency: 'daily' as const, priority: 0.9 },
    { url: `${SITE_URL}/submit`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${SITE_URL}/guides`, changeFrequency: 'weekly' as const, priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly' as const, priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly' as const, priority: 0.4 },
  ]

  const blogEntries = getAllBlogPosts().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // Comparison pages from generated pairs
  let comparisonEntries: MetadataRoute.Sitemap = []
  try {
    const pairsPath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
    const pairsRaw = fs.readFileSync(pairsPath, 'utf-8')
    const pairsData = JSON.parse(pairsRaw)
    comparisonEntries = [
      { url: `${SITE_URL}/compare`, changeFrequency: 'weekly' as const, priority: 0.6 },
      ...(pairsData.pairs || []).map((p: { slugA: string; slugB: string }) => ({
        url: `${SITE_URL}/compare/${p.slugA}-vs-${p.slugB}`,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
    ]
  } catch {
    comparisonEntries = [
      { url: `${SITE_URL}/compare`, changeFrequency: 'weekly' as const, priority: 0.6 },
    ]
  }

  return [...staticPages, ...serverEntries, ...categoryEntries, ...guideEntries, ...bestForEntries, ...blogEntries, ...comparisonEntries]
}
