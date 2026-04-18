import Link from 'next/link'
import NewsletterSignup from '@/components/NewsletterSignup'
import { createPublicClient } from '@/lib/supabase/public'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_URL,
} from '@/lib/constants'
import type { Category } from '@/lib/constants'
import { JsonLdScript, generateOrganizationJsonLd, generateWebSiteJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'
import Hero from '@/components/home/Hero'
import Featured, { type FeaturedServer } from '@/components/home/Featured'
import Trending, { type TrendingRow } from '@/components/home/Trending'
import UseCases, { HOMEPAGE_USECASES, type UseCaseTileData } from '@/components/home/UseCases'
import Advisories, { type HomeAdvisory } from '@/components/home/Advisories'
import CategoriesGrid, { type HomeCategory } from '@/components/home/CategoriesGrid'
import ScoringExplainer from '@/components/home/ScoringExplainer'

export const revalidate = 86400

export const metadata: Metadata = {
  title: `${SITE_NAME} — Find the Right MCP Server`,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} — Find the Right MCP Server`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@MCPpedia',
    creator: '@MCPpedia',
    title: `${SITE_NAME} — Find the Right MCP Server`,
    description: SITE_DESCRIPTION,
  },
  alternates: { canonical: SITE_URL },
}

const MCPPEDIA_SLUG = 'mcp-server-mcppedia'

/** Shared field list for compact card data on the homepage. */
const CARD_FIELDS = [
  'slug',
  'name',
  'tagline',
  'homepage_url',
  'author_name',
  'author_github',
  'author_type',
  'score_total',
  'github_stars',
  'npm_weekly_downloads',
  'transport',
  'categories',
  'cve_count',
  'verified',
].join(', ')

const USECASE_CATEGORIES: Record<string, string[]> = {
  'developers': ['developer-tools'],
  'data-engineering': ['data', 'analytics'],
  'productivity': ['productivity', 'communication'],
  'ai-agents': ['ai-ml'],
  'cloud-infrastructure': ['cloud', 'devops'],
  'security': ['security'],
}

async function getHomeData() {
  const supabase = createPublicClient()

  // Base stats RPC (existing). Plus a supplementary count for advisories_week.
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString()

  const [
    statsResult,
    advisoriesWeekResult,
    mcppediaResult,
    topScoredResult,
    trendingResult,
    usecaseResults,
    recentAdvisoriesResult,
    categoryCountResults,
  ] = await Promise.all([
    supabase.rpc('home_stats'),
    supabase
      .from('security_advisories')
      .select('*', { count: 'exact', head: true })
      .gte('published_at', weekAgoIso),
    supabase.from('servers').select(CARD_FIELDS).eq('slug', MCPPEDIA_SLUG).maybeSingle(),
    supabase
      .from('servers')
      .select(CARD_FIELDS)
      .neq('slug', MCPPEDIA_SLUG)
      .eq('is_archived', false)
      .order('score_total', { ascending: false, nullsFirst: false })
      .limit(2),
    supabase
      .from('servers')
      .select(CARD_FIELDS)
      .eq('is_archived', false)
      .gt('npm_weekly_downloads', 0)
      .order('npm_weekly_downloads', { ascending: false })
      .limit(10),
    Promise.all(
      HOMEPAGE_USECASES.map(async uc => {
        const cats = USECASE_CATEGORIES[uc.id] ?? []
        const [{ data: top }, { count }] = await Promise.all([
          supabase
            .from('servers')
            .select('slug, name, homepage_url, author_github')
            .overlaps('categories', cats)
            .eq('is_archived', false)
            .order('score_total', { ascending: false, nullsFirst: false })
            .limit(3),
          supabase
            .from('servers')
            .select('*', { count: 'exact', head: true })
            .overlaps('categories', cats)
            .eq('is_archived', false),
        ])
        return { uc, top: top ?? [], count: count ?? 0 }
      }),
    ),
    supabase
      .from('security_advisories')
      .select('id, cve_id, severity, title, status, published_at, server:servers!inner(name, slug)')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(5),
    Promise.all(
      CATEGORIES.map(async cat => {
        const { count } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .contains('categories', [cat])
          .eq('is_archived', false)
        return { slug: cat, label: CATEGORY_LABELS[cat as Category], count: count ?? 0 }
      }),
    ),
  ])

  const statsData = (statsResult.data ?? {}) as {
    total_servers?: number
    official_count?: number
    open_cves?: number
  }

  const stats = {
    total_servers: statsData.total_servers ?? 0,
    official_count: statsData.official_count ?? 0,
    open_cves: statsData.open_cves ?? 0,
    advisories_week: advisoriesWeekResult.count ?? 0,
  }

  const featured: FeaturedServer[] = [
    mcppediaResult.data as unknown as FeaturedServer | null,
    ...(((topScoredResult.data ?? []) as unknown) as FeaturedServer[]),
  ].filter((s): s is FeaturedServer => !!s)

  const trending: TrendingRow[] = ((trendingResult.data ?? []) as unknown) as TrendingRow[]

  const useCaseTiles: UseCaseTileData[] = usecaseResults.map(r => ({
    id: r.uc.id,
    title: r.uc.title,
    subtitle: r.uc.subtitle,
    accent: r.uc.accent,
    count: r.count,
    top: r.top,
  }))

  const advisories: HomeAdvisory[] = ((recentAdvisoriesResult.data ?? []) as unknown as Array<{
    id: string
    cve_id: string | null
    severity: HomeAdvisory['severity']
    title: string
    status: HomeAdvisory['status']
    published_at: string | null
    server: { name: string; slug: string } | { name: string; slug: string }[]
  }>).map(r => {
    const server = Array.isArray(r.server) ? r.server[0] : r.server
    return {
      id: r.id,
      cve_id: r.cve_id,
      severity: r.severity,
      title: r.title,
      status: r.status,
      published_at: r.published_at,
      server_name: server?.name ?? 'unknown',
      server_slug: server?.slug ?? '',
    }
  })

  // Mark the top 3 non-empty categories as "Hot" — gentle visual cue without
  // requiring time-series data.
  const sortedCounts = [...categoryCountResults]
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
  const hotSet = new Set(sortedCounts.slice(0, 3).map(c => c.slug))
  const categoryTiles: HomeCategory[] = categoryCountResults.map(c => ({
    ...c,
    hot: hotSet.has(c.slug),
  }))

  return { stats, featured, trending, useCaseTiles, advisories, categoryTiles }
}

export default async function HomePage() {
  const { stats, featured, trending, useCaseTiles, advisories, categoryTiles } = await getHomeData()

  return (
    <div>
      <JsonLdScript data={[generateOrganizationJsonLd(), generateWebSiteJsonLd()]} />

      <Hero stats={stats} />

      {featured.length > 0 && <Featured servers={featured} />}

      {trending.length > 0 && <Trending rows={trending} />}

      <UseCases tiles={useCaseTiles} />

      <Advisories advisories={advisories} />

      <CategoriesGrid categories={categoryTiles} />

      <ScoringExplainer />

      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-10">
          <NewsletterSignup
            variant="banner"
            context="Weekly CVE alerts, new server roundups, and MCP ecosystem insights. Free."
          />
        </div>
      </section>

      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-12">
          <div className="border border-accent/20 rounded-lg p-6 bg-accent/5 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary mb-1">New to MCP?</h2>
              <p className="text-sm text-text-muted">
                MCP lets your AI assistant use real tools — search Slack, manage GitHub, query
                databases. Set up your first server in 2 minutes.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Link
                href="/get-started"
                className="px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors"
              >
                What is MCP?
              </Link>
              <Link
                href="/setup"
                className="px-4 py-2 text-sm rounded-md border border-border text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                Setup guide
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
