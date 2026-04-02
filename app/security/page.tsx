import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Security Advisories',
  description: 'Latest security vulnerabilities found in MCP servers. CVE tracking powered by OSV.dev.',
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

export default async function SecurityPage() {
  const supabase = await createClient()

  const { data: advisories } = await supabase
    .from('security_advisories')
    .select('*, server:servers(name, slug)')
    .order('published_at', { ascending: false })
    .limit(50)

  const { data: stats } = await supabase
    .from('security_advisories')
    .select('severity')

  const statsList = (stats || []) as Array<{ severity: string }>
  const severityCounts = {
    critical: statsList.filter(s => s.severity === 'critical').length,
    high: statsList.filter(s => s.severity === 'high').length,
    medium: statsList.filter(s => s.severity === 'medium').length,
    low: statsList.filter(s => s.severity === 'low').length,
  }

  const severityColor: Record<string, string> = {
    critical: 'bg-red text-white',
    high: 'bg-red/80 text-white',
    medium: 'bg-yellow text-white',
    low: 'bg-bg-tertiary text-text-muted',
    info: 'bg-bg-tertiary text-text-muted',
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">Security Advisories</h1>
      <p className="text-text-muted mb-6">
        Known vulnerabilities in MCP servers, tracked via{' '}
        <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">OSV.dev</a>.
        Updated daily.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Object.entries(severityCounts).map(([sev, count]) => (
          <div key={sev} className="border border-border rounded-md p-4 text-center">
            <div className="text-2xl font-bold text-text-primary">{count}</div>
            <div className="text-xs text-text-muted capitalize">{sev}</div>
          </div>
        ))}
      </div>

      {/* Advisory list */}
      <div className="space-y-3">
        {(advisories as AdvisoryWithServer[] || []).map(adv => (
          <div key={adv.id} className="border border-border rounded-md p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${severityColor[adv.severity] || severityColor.info}`}>
                    {adv.severity}
                  </span>
                  {adv.cvss_score && (
                    <span className="text-xs text-text-muted">CVSS {adv.cvss_score}</span>
                  )}
                  {adv.cve_id && (
                    <code className="text-xs text-text-muted">{adv.cve_id}</code>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${adv.status === 'fixed' ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                    {adv.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-text-primary">{adv.title}</p>
                {adv.server && (
                  <Link href={`/s/${adv.server.slug}`} className="text-xs text-accent hover:text-accent-hover">
                    {adv.server.name}
                  </Link>
                )}
              </div>
              <div className="text-xs text-text-muted shrink-0">
                {adv.published_at && new Date(adv.published_at).toLocaleDateString()}
              </div>
            </div>
            {adv.fixed_version && (
              <p className="text-xs text-green mt-1">Fixed in version {adv.fixed_version}</p>
            )}
            {adv.source_url && (
              <a href={adv.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover mt-1 inline-block">
                View advisory &rarr;
              </a>
            )}
          </div>
        ))}
      </div>

      {(!advisories || advisories.length === 0) && (
        <p className="text-text-muted text-sm">No security advisories found. This is good!</p>
      )}
    </div>
  )
}
