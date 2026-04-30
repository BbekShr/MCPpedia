import Link from 'next/link'
import { unstable_cache } from 'next/cache'
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
import {
  JsonLdScript,
  generateOrganizationJsonLd,
  generateWebSiteJsonLd,
  generateDatasetJsonLd,
  generateFAQJsonLd,
} from '@/lib/seo'
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

type UseCaseRpcEntry = {
  count: number
  top: { slug: string; name: string; homepage_url: string | null; author_github: string | null }[]
}

type CategoryCount = { slug: string; label: string; count: number }

// 22 separate count(*) queries — one per category — collapsed into a single
// shared 24h cache. Counts shift slowly (driven by daily discovery + scoring
// runs), so a day-old snapshot is fine. Bust on demand with
// `revalidateTag('home-categories')` after a discovery sweep if needed.
const getCategoryCounts = unstable_cache(
  async (): Promise<CategoryCount[]> => {
    const supabase = createPublicClient()
    return Promise.all(
      CATEGORIES.map(async cat => {
        const { count, error } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .contains('categories', [cat])
          .eq('is_archived', false)
        // Throw on error so unstable_cache doesn't pin a 0-count snapshot for
        // 24h after a transient statement timeout.
        if (error) {
          console.error(`[home] category count error for ${cat}:`, error)
          throw new Error(`category count failed for ${cat}: ${error.message || JSON.stringify(error)}`)
        }
        return { slug: cat, label: CATEGORY_LABELS[cat as Category], count: count ?? 0 }
      }),
    )
  },
  ['home-category-counts-v1'],
  { revalidate: 86400, tags: ['home-categories'] },
)

async function getHomeData() {
  const supabase = createPublicClient()

  const [
    statsResult,
    mcppediaResult,
    topScoredResult,
    trendingResult,
    usecaseResults,
    recentAdvisoriesResult,
    categoryCountResults,
  ] = await Promise.all([
    supabase.rpc('home_stats'),
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
    supabase.rpc('home_use_cases'),
    supabase
      .from('security_advisories')
      .select('id, cve_id, severity, title, status, published_at, server:servers!inner(name, slug)')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(5),
    getCategoryCounts(),
  ])

  // ISR caches this render for 24h (revalidate = 86400). If a transient
  // Supabase failure (statement timeout, RLS hiccup) slips through, the
  // resulting empty-state HTML gets pinned for a full day. Throw on critical
  // query errors so Next.js does NOT cache the bad render — on revalidation
  // it keeps the previous good HTML; on first ever render the next request
  // retries.
  const criticalErrors = [
    ['topScored', topScoredResult.error],
    ['useCases', usecaseResults.error],
    ['trending', trendingResult.error],
    ['stats', statsResult.error],
    ['advisories', recentAdvisoriesResult.error],
  ].filter((e): e is [string, NonNullable<typeof e[1]>] => e[1] != null)

  if (criticalErrors.length > 0) {
    console.error('[home] Supabase query failures — refusing to cache empty render', criticalErrors)
    throw new Error(
      `Homepage data fetch failed: ${criticalErrors.map(([k, e]) => `${k}: ${e.message}`).join('; ')}`,
    )
  }

  const statsData = (statsResult.data ?? {}) as {
    total_servers?: number
    official_count?: number
    open_cves?: number
    servers_with_open_cves?: number
  }

  const stats = {
    total_servers: statsData.total_servers ?? 0,
    official_count: statsData.official_count ?? 0,
    open_cves: statsData.open_cves ?? 0,
    servers_with_open_advisories: statsData.servers_with_open_cves ?? 0,
  }

  const featured: FeaturedServer[] = [
    mcppediaResult.data as unknown as FeaturedServer | null,
    ...(((topScoredResult.data ?? []) as unknown) as FeaturedServer[]),
  ].filter((s): s is FeaturedServer => !!s)

  const trending: TrendingRow[] = ((trendingResult.data ?? []) as unknown) as TrendingRow[]

  const useCaseData = (usecaseResults.data ?? {}) as Record<string, UseCaseRpcEntry>
  const useCaseTiles: UseCaseTileData[] = HOMEPAGE_USECASES.map(uc => ({
    id: uc.id,
    title: uc.title,
    subtitle: uc.subtitle,
    accent: uc.accent,
    count: useCaseData[uc.id]?.count ?? 0,
    top: useCaseData[uc.id]?.top ?? [],
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

  const homepageFaqs = [
    {
      question: 'What is an MCP server?',
      answer: 'An MCP (Model Context Protocol) server is a small program that exposes tools, data, or actions to AI assistants like Claude Desktop, Claude Code, Cursor, and Windsurf. Servers can read files, query databases, call APIs, search the web, or trigger workflows — the AI agent calls them just like a function.',
    },
    {
      question: 'How does MCPpedia score MCP servers?',
      answer: 'Every server gets a 0–100 score across five axes: Security (CVE scanning, tool-poisoning detection, auth requirements, license), Maintenance (commit recency, GitHub stars, open issues, weekly downloads), Documentation (README quality, setup steps, examples, schema coverage), Compatibility (transports and confirmed clients), and Efficiency (total tool tokens, tokens per call). Methodology is fully public.',
    },
    {
      question: 'Which MCP server should I install first?',
      answer: 'Start with the use-case tile that matches your work: developers usually want filesystem, GitHub, and a database server (Postgres or Supabase); productivity users want Slack, Notion, or Google Drive; AI-agent builders want web-search and memory servers. Filter by score, then check CVEs and last-commit recency before installing.',
    },
    {
      question: 'Is MCPpedia free? Who runs it?',
      answer: `MCPpedia is free, has no paywall, and accepts community submissions. It tracks ${stats.total_servers.toLocaleString()}+ servers, scoring each one independently. Listings are not pay-to-play; vendors can claim and verify their servers but cannot pay for ranking.`,
    },
    {
      question: 'How often is the data updated?',
      answer: 'GitHub metadata, npm/PyPI downloads, and health checks refresh on a daily cadence. CVE feeds and security advisories sync hourly. Scoring recomputes whenever the underlying signals change. Last-modified dates are exposed in the sitemap so search engines and answer engines see freshness.',
    },
  ]

  return (
    <div>
      <JsonLdScript
        data={[
          generateOrganizationJsonLd(),
          generateWebSiteJsonLd(),
          generateDatasetJsonLd({
            totalServers: stats.total_servers,
            officialCount: stats.official_count,
            openCves: stats.open_cves,
          }),
          generateFAQJsonLd(homepageFaqs),
        ]}
      />

      <Hero stats={stats} />

      {featured.length > 0 && <Featured servers={featured} />}

      {trending.length > 0 && <Trending rows={trending} />}

      <UseCases tiles={useCaseTiles} />

      <Advisories advisories={advisories} />

      <CategoriesGrid categories={categoryTiles} />

      <ScoringExplainer />

      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-12">
          <h2 className="text-2xl font-semibold text-text-primary mb-6">Frequently asked questions</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {homepageFaqs.map((faq) => (
              <details
                key={faq.question}
                className="border border-border rounded-lg p-4 bg-bg-secondary group"
              >
                <summary className="font-medium text-text-primary cursor-pointer list-none flex justify-between items-center">
                  <span>{faq.question}</span>
                  <span className="text-text-muted text-xl group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm text-text-muted leading-relaxed">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

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
