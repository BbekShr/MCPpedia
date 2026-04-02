import { CATEGORIES, SITE_URL } from '@/lib/constants'
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [{ url: SITE_URL }]
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()

  const { data: servers } = await supabase
    .from('servers')
    .select('slug, updated_at')
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

  const guideEntries = [
    'what-is-mcp',
    'install-first-server',
    'best-servers-2026',
  ].map(slug => ({
    url: `${SITE_URL}/guides/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  const staticPages = [
    { url: SITE_URL, changeFrequency: 'daily' as const, priority: 1.0 },
    { url: `${SITE_URL}/servers`, changeFrequency: 'daily' as const, priority: 0.9 },
    { url: `${SITE_URL}/submit`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${SITE_URL}/guides`, changeFrequency: 'weekly' as const, priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly' as const, priority: 0.4 },
  ]

  return [...staticPages, ...serverEntries, ...categoryEntries, ...guideEntries]
}
