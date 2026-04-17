import HeroStack from '@/components/HeroStack'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import ServerCard from '@/components/ServerCard'
import SearchBar from '@/components/SearchBar'
import NewsletterSignup from '@/components/NewsletterSignup'
import TrendingWidget from '@/components/TrendingWidget'
import { CATEGORIES, CATEGORY_LABELS, SITE_NAME, SITE_DESCRIPTION, SITE_URL, PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import { JsonLdScript, generateOrganizationJsonLd, generateWebSiteJsonLd } from '@/lib/seo'
import type { Server } from '@/lib/types'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'

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
  alternates: {
    canonical: SITE_URL,
  },
}

export default async function HomePage() {
  const supabase = createPublicClient()

  const [
    { data: topScored },
    { data: officialServers },
    { data: recentlyAdded },
    { count: serverCount },
    { count: withCVEs },
    { count: officialCount },
    { data: serversWithCVEs },
    { count: openCVECount },
  ] = await Promise.all([
    supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS)
      .eq('is_archived', false)
      .neq('author_type', 'official')
      .gt('score_total', 0)
      .order('score_total', { ascending: false })
      .limit(6),
    supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS)
      .eq('author_type', 'official')
      .eq('is_archived', false)
      .order('score_total', { ascending: false })
      .limit(6),
    supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('servers')
      .select('id', { count: 'exact', head: true })
      .eq('is_archived', false),
    supabase
      .from('servers')
      .select('id', { count: 'exact', head: true })
      .gt('cve_count', 0)
      .eq('is_archived', false),
    supabase
      .from('servers')
      .select('id', { count: 'exact', head: true })
      .eq('author_type', 'official')
      .eq('is_archived', false),
    supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS)
      .gt('cve_count', 0)
      .eq('is_archived', false)
      .order('cve_count', { ascending: false })
      .limit(6),
    supabase
      .from('security_advisories')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
  ])

  // If the count query failed, throw so Next.js serves the stale cached page
  // instead of caching a broken render with 0 values
  if (!serverCount) {
    throw new Error('Failed to fetch server count from Supabase')
  }

  // Deduplicate: track server IDs already shown to avoid repeats across sections
  const shownIds = new Set<string>()
  function dedup(list: Server[] | null): Server[] {
    if (!list) return []
    const filtered = (list as Server[]).filter(s => !shownIds.has(s.id))
    filtered.forEach(s => shownIds.add(s.id))
    return filtered
  }

  return (
    <div>
      <JsonLdScript data={[generateOrganizationJsonLd(), generateWebSiteJsonLd()]} />
      {/* Hero — clear value prop */}
      <section className="border-b border-border" style={{ background: 'var(--hero-gradient)' }}>
        <div className="max-w-[1200px] mx-auto px-4 pt-14 pb-10 md:pt-20 md:pb-16">
          <div className="grid lg:grid-cols-[1fr_minmax(0,380px)] gap-10 lg:gap-16 items-center">
            <div className="max-w-2xl">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4 tracking-tight leading-[1.1]">
                Find the right MCP server.<br />
                <span className="text-accent">Know if it&apos;s safe before you install.</span>
              </h1>
              <p className="text-base md:text-lg text-text-muted mb-6 max-w-lg">
                Every server scored on security, maintenance, and efficiency — backed by real CVE data, not opinions.
              </p>
              <div className="max-w-xl mb-4 min-h-[48px]">
                <SearchBar
                  placeholder={`Search ${serverCount || 0}+ MCP servers...`}
                  large
                />
              </div>
            </div>
            <div className="hidden md:block">
              <HeroStack className="max-w-[340px] lg:max-w-[380px] mx-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* Live stats — shows the site is alive and data-driven */}
      <section className="border-b border-border bg-bg-secondary">
        <div className="max-w-[1200px] mx-auto px-4 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">{(serverCount || 0).toLocaleString()}</div>
              <div className="text-xs text-text-muted">Servers tracked and counting</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">{officialCount || 0}</div>
              <div className="text-xs text-text-muted">Official servers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red">{openCVECount || 0}</div>
              <div className="text-xs text-text-muted">Open CVEs across {withCVEs || 0} servers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green">Daily</div>
              <div className="text-xs text-text-muted">Security scans</div>
            </div>
          </div>
        </div>
      </section>

      {/* MCPpedia MCP server promotion */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-10">
          <div className="border border-border border-l-4 border-l-accent rounded-lg p-6 bg-bg-secondary flex flex-col md:flex-row gap-6 items-stretch">
            <div className="flex-1 min-w-0">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 rounded-full px-2.5 py-0.5 mb-3">
                MCPpedia MCP server
              </span>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-1.5">
                Use MCPpedia inside your AI assistant
              </h2>
              <p className="text-sm text-text-muted mb-4 max-w-xl">
                Search 18,000+ MCP servers, check security, and grab install configs — straight from Claude, Cursor, or any MCP client.
              </p>
              <pre className="text-[12.5px] leading-snug bg-code-bg border border-border rounded-md p-3 overflow-x-auto m-0 text-text-primary">{`{
  "mcpServers": {
    "mcppedia": { "url": "https://mcppedia.org/mcp" }
  }
}`}</pre>
            </div>
            <div className="flex flex-col justify-center gap-2 shrink-0 md:w-44">
              <Link
                href="/s/mcp-server-mcppedia"
                className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors text-center"
              >
                Install MCPpedia →
              </Link>
              <a
                href="https://www.npmjs.com/package/mcp-server-mcppedia"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 text-sm rounded-md border border-border text-text-primary hover:bg-bg-tertiary transition-colors text-center"
              >
                npm package
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* What makes MCPpedia different — quick visual proof */}
      <section className="max-w-[1200px] mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-0.5">Security scanned</p>
              <p className="text-xs text-text-muted">Every server checked against OSV.dev for CVEs. Daily.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="4" width="3" height="14" rx="0.5"/></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-0.5">Scored, not listed</p>
              <p className="text-xs text-text-muted">Every server rated 0-100 on security, maintenance, docs, and context cost.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 13l2 2 4-4"/></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-0.5">Copy-paste install</p>
              <p className="text-xs text-text-muted">Config ready for Claude Desktop, Cursor, and Claude Code. No guessing.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trending this week */}
      <TrendingWidget />

      {/* Browse by use case — first orientation point for new visitors */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-12">
          <h2 className="text-lg font-semibold text-text-primary mb-1">Find servers for...</h2>
          <p className="text-xs text-text-muted mb-4">Browse by use case to find the right tools for your stack</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { href: '/best-for/developers', label: 'Code & Dev Tools', desc: 'GitHub, databases, filesystems', color: 'border-l-accent' },
              { href: '/best-for/data-engineering', label: 'Data & Analytics', desc: 'SQL, pipelines, dashboards', color: 'border-l-green' },
              { href: '/best-for/productivity', label: 'Productivity', desc: 'Slack, email, calendar', color: 'border-l-yellow' },
              { href: '/best-for/ai-agents', label: 'AI & Agents', desc: 'Memory, reasoning, search', color: 'border-l-accent' },
              { href: '/best-for/cloud-infrastructure', label: 'Cloud & DevOps', desc: 'AWS, Docker, Kubernetes', color: 'border-l-green' },
              { href: '/best-for/security', label: 'Security', desc: 'Scanning, compliance, secrets', color: 'border-l-red' },
              { href: '/best-for/web-scraping', label: 'Web Scraping', desc: 'Crawling, extraction, automation', color: 'border-l-accent' },
              { href: '/best-for/file-management', label: 'File Management', desc: 'Cloud storage, documents, storage', color: 'border-l-yellow' },
              { href: '/best-for/monitoring', label: 'Monitoring', desc: 'Logging, metrics, alerting', color: 'border-l-green' },
              { href: '/best-for/communication', label: 'Communication', desc: 'Email, chat, notifications', color: 'border-l-accent' },
              { href: '/best-for/databases', label: 'Databases', desc: 'SQL, NoSQL, vectors, caching', color: 'border-l-green' },
              { href: '/best-for/design-tools', label: 'Design & Creative', desc: 'Image generation, design tools', color: 'border-l-yellow' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`border border-border border-l-[3px] ${item.color} rounded-md p-4 min-h-[80px] flex flex-col justify-center hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px] transition-all`}
              >
                <span className="font-medium text-sm text-text-primary block">{item.label}</span>
                <span className="text-xs text-text-muted">{item.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Top scored servers — the best of the best */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Highest rated</h2>
              <p className="text-xs text-text-muted">Servers with the best MCPpedia scores</p>
            </div>
            <Link href="/servers?sort=score" className="text-sm text-accent hover:text-accent-hover">
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dedup(topScored as Server[]).map(server => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        </div>
      </section>

      {/* Official servers */}
      {officialServers && officialServers.length > 0 && (
        <section className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 py-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Official servers</h2>
                <p className="text-xs text-text-muted">Built by the companies behind the services</p>
              </div>
              <Link href="/servers?author=official" className="text-sm text-accent hover:text-accent-hover">
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dedup(officialServers as Server[]).map(server => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Servers with CVEs — transparency */}
      {serversWithCVEs && serversWithCVEs.length > 0 && (
        <section className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 py-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Servers with known CVEs</h2>
                <p className="text-xs text-text-muted">{withCVEs || 0} servers have vulnerabilities — check before you install</p>
              </div>
              <Link href="/security" className="text-sm text-accent hover:text-accent-hover">
                All advisories &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dedup(serversWithCVEs as Server[]).map(server => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Browse by category pills */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-10">
          <h2 className="text-lg font-semibold text-text-primary mb-4">All categories</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <Link
                key={cat}
                href={`/category/${cat}`}
                className="px-3.5 py-2 text-sm rounded-full border border-border text-text-primary hover:border-accent hover:bg-accent-subtle hover:text-accent transition-colors min-h-[44px] flex items-center"
              >
                {CATEGORY_LABELS[cat as Category]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recently added — shows the site is alive */}
      {recentlyAdded && recentlyAdded.length > 0 && (
        <section className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 py-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Just added</h2>
                <p className="text-xs text-text-muted">New servers discovered by our bots</p>
              </div>
              <Link href="/servers?sort=newest" className="text-sm text-accent hover:text-accent-hover">
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dedup(recentlyAdded as Server[]).map(server => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-10">
          <NewsletterSignup
            variant="banner"
            context="Weekly CVE alerts, new server roundups, and MCP ecosystem insights. Free."
          />
        </div>
      </section>

      {/* New to MCP? */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-12 md:py-14">
          <div className="border border-accent/20 rounded-lg p-6 bg-accent/5 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary mb-1">New to MCP?</h2>
              <p className="text-sm text-text-muted">
                MCP lets your AI assistant use real tools — search Slack, manage GitHub, query databases.
                Set up your first server in 2 minutes.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <Link href="/get-started" className="px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors">
                What is MCP?
              </Link>
              <Link href="/setup" className="px-4 py-2 text-sm rounded-md border border-border text-text-primary hover:bg-bg-tertiary transition-colors">
                Setup guide
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
