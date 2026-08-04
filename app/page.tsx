import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import NewsletterSignup from '@/components/NewsletterSignup'
import { createPublicClient } from '@/lib/supabase/public'
import { withRetry } from '@/lib/retry'
import { liveDataOrNull } from '@/lib/degrade'
import LiveDataUnavailable from '@/components/LiveDataUnavailable'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import { getCatalogCounts, buildSiteDescription } from '@/lib/live-counts'
import { buildUseCaseTiles, buildCategoryTiles } from '@/lib/home-tiles'
import {
  JsonLdScript,
  generateOrganizationJsonLd,
  generateWebSiteJsonLd,
  generateDatasetJsonLd,
  generateFAQJsonLd,
} from '@/lib/seo'
import type { Metadata } from 'next'
import Hero from '@/components/home/Hero'
import RevealOnScroll from '@/components/home/RevealOnScroll'
import Featured, { type FeaturedServer } from '@/components/home/Featured'
import Trending, { type TrendingRow } from '@/components/home/Trending'
import UseCases from '@/components/home/UseCases'
import Advisories, { type HomeAdvisory } from '@/components/home/Advisories'
import CategoriesGrid from '@/components/home/CategoriesGrid'
import ScoringExplainer from '@/components/home/ScoringExplainer'

// Skip prerender at build time — home_stats can hit Postgres statement
// timeouts (57014) under build-worker concurrency, which would fail the
// build. Caching happens at the data layer below via unstable_cache, so
// each request still serves a 24h-cached snapshot.
export const dynamic = 'force-dynamic'

// generateMetadata rather than a static object so the description carries the
// LIVE catalog count from the shared home_stats snapshot. The constant it falls
// back to no longer names a number at all — see lib/live-counts.ts for why the
// hardcoded "17,000+" had to go.
export async function generateMetadata(): Promise<Metadata> {
  const { totalServers } = await getCatalogCounts()
  const description = buildSiteDescription(totalServers)
  const title = `${SITE_NAME} — Find the Right MCP Server`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      // Trailing slash to match the canonical the sitemap now publishes.
      url: `${SITE_URL}/`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      site: '@MCPpedia',
      creator: '@MCPpedia',
      title,
      description,
    },
    alternates: { canonical: `${SITE_URL}/` },
  }
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

// Cache the homepage's six Supabase round-trips for 24h. Bot-driven data
// (scoring, CVE feeds, npm downloads) refreshes daily, so a day-old snapshot
// is fine. Bust on demand with `revalidateTag('home-page')`. Throwing inside
// the cached function (see criticalErrors below) is what keeps a transient
// Supabase blip from pinning an empty-state snapshot for 24h — unstable_cache
// only caches successful returns.
//
// withRetry wraps the fetch so a one-off transient failure (cold connection,
// statement timeout) is retried a few times before it bubbles to the error
// boundary. Without this, a single blip on a cache-miss request showed the user
// "Something went wrong" until they reloaded. Retries live inside the cached
// function so only the final successful result is cached.
const getHomeData = unstable_cache(
  () => withRetry(fetchHomeData),
  // v3: unstable_cache persists across deployments and the callback text is
  // unchanged, so a pre-S81 entry holding zeroed use-case/category tiles could
  // otherwise survive up to 24h and hide the fix.
  ['home-page-data-v3'],
  { revalidate: 86400, tags: ['home-page'] },
)

async function fetchHomeData() {
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
    // `score_total IS NOT NULL` lets Postgres use servers_score_active_idx
    // for an Index Scan + LIMIT (~0.1ms) instead of a 2.5s seq scan + sort.
    // Unscored servers wouldn't be in the top-2 anyway. We over-fetch to 3
    // and drop MCPpedia in JS so the index condition stays clean.
    supabase
      .from('servers')
      .select(CARD_FIELDS)
      .eq('is_archived', false)
      .not('score_total', 'is', null)
      .order('score_total', { ascending: false })
      .limit(3),
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
      // No nullsFirst: false here. DESC NULLS LAST cannot be served by a plain
      // btree (Postgres DESC defaults to NULLS FIRST), so it forced a full sort
      // of all 27,405 advisory rows — 1.81s versus 0.41s for the identical rows
      // without it. Zero rows have a null published_at, so dropping it changes
      // no result. This is the un-audited call site S54 named.
      .order('published_at', { ascending: false })
      .limit(5),
    supabase.rpc('home_category_counts'),
  ])

  // Throw on errors that would render the homepage as a hollow shell so
  // unstable_cache refuses to pin the empty snapshot for 24h. home_stats is
  // intentionally NOT in this list — it sometimes hits 57014 statement
  // timeouts, but every consumer below already falls back to `?? 0`, so a
  // partial render with zeroed hero stats is far better than a 500.
  if (statsResult.error) {
    console.warn('[home] home_stats failed (rendering with 0s):', statsResult.error)
  }
  // home_use_cases and home_category_counts are both snapshot-backed as of
  // 20260801120000_home_aggregates_snapshot_cache.sql: each is now a sub-ms
  // single-row read of `home_aggregates_cache`, refreshed nightly by
  // bots/compute-scores as service_role. They used to be aggregate scans over
  // the ~46k-row catalog run as anon (3s statement timeout) and returned 57014
  // on 10/10 calls during the 2026-08-01 incident.
  //
  // They stay OUT of criticalErrors on purpose. Post-snapshot the remaining
  // failure mode is a SUCCESSFUL response carrying null — the snapshot has never
  // been built, or the key is missing from `data`. That must omit two sections,
  // not 500 the whole page, so buildUseCaseTiles/buildCategoryTiles map absent
  // to null and the JSX guards drop the sections.
  if (usecaseResults.error) {
    console.warn('[home] home_use_cases failed (omitting the section):', usecaseResults.error)
  }
  if (categoryCountResults.error) {
    console.warn(
      '[home] home_category_counts failed (omitting the section):',
      categoryCountResults.error,
    )
  }
  const criticalErrors = [
    ['topScored', topScoredResult.error],
    ['trending', trendingResult.error],
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

  const topScored = (((topScoredResult.data ?? []) as unknown) as FeaturedServer[])
    .filter(s => s.slug !== MCPPEDIA_SLUG)
    .slice(0, 2)
  const featured: FeaturedServer[] = [
    mcppediaResult.data as unknown as FeaturedServer | null,
    ...topScored,
  ].filter((s): s is FeaturedServer => !!s)

  const trending: TrendingRow[] = ((trendingResult.data ?? []) as unknown) as TrendingRow[]

  // null (not zeroed tiles) when the aggregate is absent — every tile would
  // read "0 servers", a visible falsehood that unstable_cache would then pin for
  // 24h. "Absent" covers an error AND a successful-but-null/empty result, which
  // is what an unseeded home_aggregates_cache returns. See lib/home-tiles.ts.
  const useCaseTiles = buildUseCaseTiles(usecaseResults)

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

  // Same absent-aggregate rule as useCaseTiles: an absent snapshot omits the
  // whole grid, while a genuinely empty category still shows a 0 tile.
  const categoryTiles = buildCategoryTiles(categoryCountResults)

  return { stats, featured, trending, useCaseTiles, advisories, categoryTiles }
}

export default async function HomePage() {
  // fetchHomeData throws when the queries that carry the page fail, which is
  // what stops unstable_cache pinning a hollow homepage for 24h. Catching it
  // out here keeps that property while replacing the generic crash boundary
  // with a shell that says what is actually wrong. No JSON-LD is emitted on
  // this path — publishing a Dataset with zeroed counts is worse than
  // publishing nothing.
  //
  // The 9s budget (vs the 6s default) is deliberate: the budget exists to bound
  // a *user-facing* wait, but getHomeData is cached for 24h, so it only ever
  // runs on a cache miss. If the budget is shorter than the cold fetch, the
  // cache never fills and EVERY visitor gets the degraded shell forever — which
  // is exactly what happened. It must be long enough for the fetch to complete
  // at least once. 9s stays under the 10s platform function floor.
  const data = await liveDataOrNull(getHomeData, 9000)
  if (!data) return <LiveDataUnavailable title="The catalog is temporarily unavailable" />

  const { stats, featured, trending, useCaseTiles, advisories, categoryTiles } = data

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

      {featured.length > 0 && (
        <RevealOnScroll>
          <Featured servers={featured} />
        </RevealOnScroll>
      )}

      {trending.length > 0 && (
        <RevealOnScroll>
          <Trending rows={trending} />
        </RevealOnScroll>
      )}

      {/* null means the backing aggregate is absent (RPC error, or a snapshot
          that has never been built) — drop the whole section, heading included,
          rather than render a grid of zeroed counts. */}
      {useCaseTiles && (
        <RevealOnScroll>
          <UseCases tiles={useCaseTiles} />
        </RevealOnScroll>
      )}

      <RevealOnScroll>
        <Advisories advisories={advisories} />
      </RevealOnScroll>

      {categoryTiles && (
        <RevealOnScroll>
          <CategoriesGrid categories={categoryTiles} />
        </RevealOnScroll>
      )}

      <RevealOnScroll>
        <ScoringExplainer />
      </RevealOnScroll>

      <RevealOnScroll>
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
      </RevealOnScroll>

      <RevealOnScroll>
        <section className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-10">
            <NewsletterSignup
              variant="banner"
              context="Weekly CVE alerts, new server roundups, and MCP ecosystem insights. Free."
            />
          </div>
        </section>
      </RevealOnScroll>

      <RevealOnScroll>
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
      </RevealOnScroll>
    </div>
  )
}
