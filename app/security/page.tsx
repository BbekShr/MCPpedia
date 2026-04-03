import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Security Advisories',
  description: 'Latest security vulnerabilities found in MCP servers. CVE tracking powered by OSV.dev. Updated daily.',
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

export default async function SecurityPage() {
  const supabase = await createClient()

  const [{ data: advisories }, { data: allAdvisories }, { count: totalServers }, { count: serversWithCVEs }] = await Promise.all([
    supabase
      .from('security_advisories')
      .select('*, server:servers(name, slug)')
      .order('published_at', { ascending: false })
      .limit(100),
    supabase
      .from('security_advisories')
      .select('severity, status'),
    supabase
      .from('servers')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', false),
    supabase
      .from('servers')
      .select('*', { count: 'exact', head: true })
      .gt('cve_count', 0)
      .eq('is_archived', false),
  ])

  const all = (allAdvisories || []) as Array<{ severity: string; status: string }>
  const totalCVEs = all.length
  const openCount = all.filter(a => a.status === 'open').length
  const fixedCount = all.filter(a => a.status === 'fixed').length
  const severityCounts = {
    critical: all.filter(s => s.severity === 'critical').length,
    high: all.filter(s => s.severity === 'high').length,
    medium: all.filter(s => s.severity === 'medium').length,
    low: all.filter(s => s.severity === 'low').length,
  }
  const cleanServers = (totalServers || 0) - (serversWithCVEs || 0)
  const cleanPct = totalServers ? Math.floor((cleanServers / totalServers) * 1000) / 10 : 0

  const advList = (advisories as AdvisoryWithServer[]) || []

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Security Advisories</h1>
        <p className="text-text-muted">
          Known vulnerabilities in MCP servers, tracked via{' '}
          <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">OSV.dev</a>.
          Updated daily. Scoring methodology is{' '}
          <Link href="/methodology" className="text-accent hover:text-accent-hover">open source</Link>.
        </p>
      </div>

      {/* Dashboard stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        <div className="border border-border rounded-md p-3 text-center">
          <div className="text-2xl font-bold text-red">{serversWithCVEs || 0}</div>
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
        <div className="border border-border rounded-md p-3 text-center border-l-3 border-l-red">
          <div className="text-2xl font-bold text-red">{severityCounts.critical}</div>
          <div className="text-xs text-text-muted">Critical</div>
        </div>
        <div className="border border-border rounded-md p-3 text-center border-l-3 border-l-red/60">
          <div className="text-2xl font-bold text-text-primary">{severityCounts.high}</div>
          <div className="text-xs text-text-muted">High</div>
        </div>
        <div className="border border-border rounded-md p-3 text-center border-l-3 border-l-yellow">
          <div className="text-2xl font-bold text-text-primary">{severityCounts.medium}</div>
          <div className="text-xs text-text-muted">Medium</div>
        </div>
        <div className="border border-border rounded-md p-3 text-center">
          <div className="text-2xl font-bold text-text-primary">{severityCounts.low}</div>
          <div className="text-xs text-text-muted">Low</div>
        </div>
      </div>

      {/* Clean server highlight */}
      <div className="border border-green/30 rounded-md p-4 bg-green/5 mb-8 flex items-center gap-3">
        <span className="text-2xl">&#x2713;</span>
        <div>
          <p className="text-sm font-medium text-text-primary">
            {cleanPct}% of servers have no open CVEs
          </p>
          <p className="text-xs text-text-muted">
            {cleanServers.toLocaleString()} of {(totalServers || 0).toLocaleString()} tracked servers are clean.
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
