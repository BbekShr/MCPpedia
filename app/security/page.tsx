import { createPublicClient } from '@/lib/supabase/public'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/constants'

// Skip prerender at build time — the home_stats RPC times out during
// `next build` (Postgres 57014). Caching happens at the data layer below
// via unstable_cache, so each request still serves a fast, cached snapshot.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Security Advisories',
  description: 'Latest security vulnerabilities found in MCP servers. CVE tracking powered by OSV.dev. Updated daily.',
  alternates: { canonical: `${SITE_URL}/security` },
}

interface AdvisoryWithServer {
  id: string
  cve_id: string | null
  severity: string
  cvss_score: number | null
  title: string
  description: string | null
  affected_versions: string | null
  fixed_version: string | null
  source_url: string | null
  status: string
  published_at: string | null
  created_at: string
  server: { name: string; slug: string } | null
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red text-white',
  high: 'bg-red/80 text-white',
  medium: 'bg-yellow/90 text-white',
  low: 'bg-bg-tertiary text-text-muted',
  info: 'bg-bg-tertiary text-text-muted',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-l-red',
  high: 'border-l-red/60',
  medium: 'border-l-yellow',
  low: 'border-l-border',
  info: 'border-l-border',
}

function timeAgo(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

interface HomeStats {
  total_servers: number
  with_cves: number
  open_cves: number
  fixed_cves: number
  cves_critical_open: number
  cves_high_open: number
  cves_medium_open: number
  cves_low_open: number
  cves_unscored_open: number
  servers_with_open_cves: number
  tool_poisoning_count: number
  injection_risk_count: number
  code_execution_count: number
  scanned_servers: number
  last_security_scan: string | null
}

// Cache the Supabase round-trip for 24h. Aggregate counts come from
// home_stats() — single source of truth shared with the homepage and blog
// posts. CVE data is refreshed daily by the security scan, so a day-old
// snapshot is acceptable. Bust on demand with `revalidateTag('security-page')`.
const getSecurityPageData = unstable_cache(
  async () => {
    const supabase = createPublicClient()
    const [advisoriesResult, statsResult] = await Promise.all([
      supabase
        .from('security_advisories')
        .select('*, server:servers(name, slug)')
        .order('published_at', { ascending: false })
        .limit(100),
      supabase.rpc('home_stats'),
    ])
    return {
      advisories: advisoriesResult.data as AdvisoryWithServer[] | null,
      stats: statsResult.data as Partial<HomeStats> | null,
      statsError: statsResult.error,
    }
  },
  ['security-page-data-v3'],
  { revalidate: 86400, tags: ['security-page'] },
)

export default async function SecurityPage() {
  const { advisories, stats, statsError } = await getSecurityPageData()

  if (!stats || statsError) {
    console.error('[security] home_stats returned empty/zero snapshot', {
      error: statsError,
      total_servers: stats?.total_servers,
      scanned_servers: stats?.scanned_servers,
      last_security_scan: stats?.last_security_scan,
    })
  }

  const openCount = stats?.open_cves ?? 0
  const fixedCount = stats?.fixed_cves ?? 0
  const totalServers = stats?.total_servers ?? 0
  const serversWithCVEs = stats?.with_cves ?? 0
  const scannedServers = stats?.scanned_servers ?? 0
  const toolPoisoningCount = stats?.tool_poisoning_count ?? 0
  const injectionRiskCount = stats?.injection_risk_count ?? 0
  const codeExecutionCount = stats?.code_execution_count ?? 0

  const severityCounts = {
    critical: stats?.cves_critical_open ?? 0,
    high: stats?.cves_high_open ?? 0,
    medium: stats?.cves_medium_open ?? 0,
    low: stats?.cves_low_open ?? 0,
    info: stats?.cves_unscored_open ?? 0,
  }
  const cleanServers = totalServers - serversWithCVEs
  const cleanPct = totalServers > 0 ? Math.floor((cleanServers / totalServers) * 1000) / 10 : 0
  const lastScanFormatted = stats?.last_security_scan
    ? new Date(stats.last_security_scan).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : null

  const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const advList = (advisories ?? []).sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
  })

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Security Advisories</h1>
        <p className="text-text-muted">
          Known vulnerabilities in MCP servers, tracked via{' '}
          <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">OSV.dev</a>.
          Scanned daily. Scoring methodology is{' '}
          <Link href="/methodology" className="text-accent hover:text-accent-hover">open source</Link>.
        </p>
        {lastScanFormatted && (
          <p className="text-xs text-text-muted mt-1">Last scan: {lastScanFormatted}</p>
        )}
      </div>

      {/* Dashboard stats */}
      <div className="space-y-3 mb-8">
        {/* Overview row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-border rounded-md p-3 text-center">
            <div className="text-2xl font-bold text-red">{serversWithCVEs}</div>
            <div className="text-xs text-text-muted">Servers affected</div>
          </div>
          <div className="border border-border rounded-md p-3 text-center">
            <div className="text-2xl font-bold text-red">{openCount}</div>
            <div className="text-xs text-text-muted">Open CVEs</div>
          </div>
          <div className="border border-border rounded-md p-3 text-center">
            <div className="text-2xl font-bold text-green">{fixedCount}</div>
            <div className="text-xs text-text-muted">Fixed CVEs</div>
          </div>
        </div>

        {/* Severity breakdown — open CVEs only */}
        <div className="border border-border rounded-md p-3">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Open CVEs by severity</div>
          <div className="grid grid-cols-5 gap-3">
            <div className="text-center border-l-2 border-l-red pl-2">
              <div className="text-2xl font-bold text-red">{severityCounts.critical}</div>
              <div className="text-xs text-text-muted">Critical</div>
            </div>
            <div className="text-center border-l-2 border-l-red/60 pl-2">
              <div className="text-2xl font-bold text-text-primary">{severityCounts.high}</div>
              <div className="text-xs text-text-muted">High</div>
            </div>
            <div className="text-center border-l-2 border-l-yellow pl-2">
              <div className="text-2xl font-bold text-text-primary">{severityCounts.medium}</div>
              <div className="text-xs text-text-muted">Medium</div>
            </div>
            <div className="text-center border-l-2 border-l-border pl-2">
              <div className="text-2xl font-bold text-text-primary">{severityCounts.low}</div>
              <div className="text-xs text-text-muted">Low</div>
            </div>
            {severityCounts.info > 0 && (
              <div className="text-center border-l-2 border-l-border pl-2">
                <div className="text-2xl font-bold text-text-muted">{severityCounts.info}</div>
                <div className="text-xs text-text-muted">Unscored</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Beyond CVEs */}
      <div className="border border-border rounded-md p-4 mb-4">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Beyond CVEs — AI-specific threats</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-red/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">{toolPoisoningCount}</div>
              <div className="text-xs font-medium text-text-primary">Tool poisoning</div>
              <div className="text-xs text-text-muted mt-0.5">Hidden instructions in tool descriptions that manipulate the AI</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-yellow/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">{injectionRiskCount}</div>
              <div className="text-xs font-medium text-text-primary">Injection risk</div>
              <div className="text-xs text-text-muted mt-0.5">Prompt injection patterns like &ldquo;ignore previous instructions&rdquo;</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-red/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">{codeExecutionCount}</div>
              <div className="text-xs font-medium text-text-primary">Code execution</div>
              <div className="text-xs text-text-muted mt-0.5">Servers with shell, eval, or subprocess tool patterns</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-3">
          Computed against the <strong className="text-text-primary tabular-nums">{scannedServers.toLocaleString()}</strong> servers
          {totalServers > 0 && ` (${((scannedServers / totalServers) * 100).toFixed(1)}% of the catalog)`}
          {' '}whose tool manifests were successfully fetched. Counts exclude servers without a live endpoint — the true surface is likely larger.
        </p>
      </div>

      {/* Clean server highlight */}
      <div className="border border-green/30 rounded-md p-4 bg-green/5 mb-8 flex items-center gap-3">
        <span className="text-2xl">&#x2713;</span>
        <div>
          <p className="text-sm font-medium text-text-primary">
            {cleanPct}% of servers have no open CVEs
          </p>
          <p className="text-xs text-text-muted">
            {cleanServers.toLocaleString()} of {totalServers.toLocaleString()} tracked servers are clean.
            {serversWithCVEs ? ` ${serversWithCVEs} server${serversWithCVEs !== 1 ? 's' : ''} have open vulnerabilities.` : ''}
          </p>
        </div>
      </div>

      {/* Advisory list */}
      <h2 className="text-lg font-semibold text-text-primary mb-4">Recent advisories</h2>
      <div className="space-y-3">
        {advList.map(adv => (
          <div key={adv.id} className={`border border-border border-l-3 ${SEVERITY_BORDER[adv.severity] || 'border-l-border'} rounded-md p-4`}>
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium uppercase ${SEVERITY_COLOR[adv.severity] || SEVERITY_COLOR.info}`}>
                {adv.severity}
              </span>
              {adv.cvss_score != null && (
                <span className="text-xs text-text-muted tabular-nums">CVSS {adv.cvss_score}</span>
              )}
              {adv.cve_id && (
                <code className="text-xs text-text-muted">{adv.cve_id}</code>
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded ${adv.status === 'fixed' ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                {adv.status}
              </span>
              {adv.published_at && (
                <span className="text-xs text-text-muted ml-auto">{timeAgo(adv.published_at)}</span>
              )}
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-text-primary">{adv.title}</p>

            {/* Description */}
            {adv.description && (
              <p className="text-xs text-text-muted mt-1 line-clamp-2">{adv.description}</p>
            )}

            {/* Details row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-text-muted">
              {adv.server && (
                <Link href={`/s/${adv.server.slug}`} className="text-accent hover:text-accent-hover font-medium">
                  {adv.server.name}
                </Link>
              )}
              {adv.affected_versions && (
                <span>Affected: <code>{adv.affected_versions}</code></span>
              )}
              {adv.fixed_version && (
                <span className="text-green">Fixed in <code>{adv.fixed_version}</code></span>
              )}
              {adv.published_at && (
                <span>{new Date(adv.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
              {adv.source_url && (
                <a href={adv.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
                  source &rarr;
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {advList.length === 0 && (
        <div className="text-center py-12 border border-border rounded-md">
          <p className="text-lg font-medium text-text-primary mb-1">No security advisories found</p>
          <p className="text-sm text-text-muted">All tracked servers are clean. CVEs are checked daily via OSV.dev.</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-border text-sm text-text-muted">
        <p>
          Vulnerability data sourced from <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">OSV.dev</a> (Google&apos;s open-source vulnerability database).
          Covers npm and PyPI ecosystems. Scanned daily at 5:00 UTC.
          {' '}<Link href="/methodology" className="text-accent hover:text-accent-hover">How we score security &rarr;</Link>
        </p>
      </div>
    </div>
  )
}
