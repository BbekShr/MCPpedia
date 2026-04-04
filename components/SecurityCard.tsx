import Link from 'next/link'
import type { Server, SecurityAdvisory } from '@/lib/types'
import { SCORE_WEIGHTS } from '@/lib/scoring'

function timeAgo(date: string): string {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function osvLink(server: Server): string | null {
  if (server.npm_package) return `https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(server.npm_package)}`
  if (server.pip_package) return `https://osv.dev/list?ecosystem=PyPI&q=${encodeURIComponent(server.pip_package)}`
  return null
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red text-white',
    high: 'bg-red/80 text-white',
    medium: 'bg-yellow/90 text-white',
    low: 'bg-bg-tertiary text-text-muted',
    info: 'bg-bg-tertiary text-text-muted',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium uppercase ${colors[severity] || colors.info}`}>
      {severity}
    </span>
  )
}

function Row({ pass, label, detail, href, linkText }: {
  pass: boolean | null
  label: string
  detail: string
  href?: string | null
  linkText?: string
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 text-sm shrink-0 ${pass === true ? 'text-green' : pass === false ? 'text-red' : 'text-text-muted'}`}>
        {pass === true ? '\u2713' : pass === false ? '\u2717' : '\u25CB'}
      </span>
      <div className="min-w-0">
        <span className="text-sm text-text-primary">{label}</span>
        <span className="text-sm text-text-muted"> &mdash; {detail}</span>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover ml-1.5">
            {linkText || 'verify \u2192'}
          </a>
        )}
      </div>
    </div>
  )
}

export default function SecurityCard({
  server,
  advisories,
}: {
  server: Server
  advisories: SecurityAdvisory[]
}) {
  const openAdvisories = advisories.filter(a => a.status === 'open')
  const fixedAdvisories = advisories.filter(a => a.status === 'fixed')
  const totalCVEs = advisories.length
  const openCount = openAdvisories.length
  const fixedCount = fixedAdvisories.length
  const criticalOrHigh = openAdvisories.filter(a => a.severity === 'critical' || a.severity === 'high').length
  const securityScore = Math.min(server.score_security || 0, SCORE_WEIGHTS.security)
  const osv = osvLink(server)

  // Summary verdict
  let verdict: string
  let verdictColor: string
  if (openCount === 0 && totalCVEs === 0) {
    verdict = 'No known vulnerabilities.'
    verdictColor = 'text-green'
  } else if (openCount === 0 && fixedCount > 0) {
    verdict = `No open vulnerabilities. ${fixedCount} fixed CVE${fixedCount !== 1 ? 's' : ''}.`
    verdictColor = 'text-green'
  } else if (criticalOrHigh > 0) {
    verdict = `${openCount} open vulnerabilit${openCount !== 1 ? 'ies' : 'y'} \u2014 ${criticalOrHigh} critical/high.`
    verdictColor = 'text-red'
  } else {
    verdict = `${openCount} open vulnerabilit${openCount !== 1 ? 'ies' : 'y'}.`
    verdictColor = 'text-yellow'
  }

  return (
    <div className="border border-border rounded-md p-4">
      {/* Header: title + score + scan date */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-text-primary">Security</h3>
        <span className={`text-sm font-semibold tabular-nums ${securityScore >= 20 ? 'text-green' : securityScore >= 10 ? 'text-yellow' : 'text-red'}`}>
          {securityScore}/{SCORE_WEIGHTS.security}
        </span>
      </div>

      {/* Scan date */}
      {server.last_security_scan && (
        <p className="text-xs text-text-muted mb-3">
          Last scanned {timeAgo(server.last_security_scan)}
        </p>
      )}

      {/* Verdict */}
      <p className={`text-sm font-medium mb-3 ${verdictColor}`}>{verdict}</p>

      {/* Evidence rows — dynamic from scoring engine, fallback to legacy */}
      <div className="border-t border-border pt-2 space-y-0">
        {server.security_evidence && server.security_evidence.length > 0 ? (
          server.security_evidence.map(e => (
            <Row
              key={e.id}
              pass={e.pass}
              label={e.label}
              detail={e.detail}
              href={e.link}
              linkText={e.link_text}
            />
          ))
        ) : (
          <>
            <Row
              pass={openCount === 0}
              label="CVEs"
              detail={totalCVEs === 0
                ? 'No known CVEs for this package'
                : `${totalCVEs} found — ${openCount} open, ${fixedCount} fixed`}
              href={osv}
              linkText="check OSV.dev →"
            />
            <Row
              pass={server.has_authentication ? true : null}
              label="Authentication"
              detail={server.has_authentication ? 'Requires authentication' : 'None required'}
            />
            <Row
              pass={!!server.license && server.license !== 'NOASSERTION'}
              label="License"
              detail={server.license && server.license !== 'NOASSERTION' ? server.license : 'Not specified'}
            />
            <Row
              pass={!server.is_archived}
              label="Repository"
              detail={server.is_archived ? 'Archived' : 'Active'}
            />
          </>
        )}
      </div>

      {/* Advisory details */}
      {advisories.length > 0 && (
        <div className="border-t border-border mt-3 pt-3">
          <h4 className="text-sm font-medium text-text-primary mb-2">
            Advisories ({openCount} open, {fixedCount} fixed)
          </h4>
          <div className="space-y-3">
            {advisories.map(adv => (
              <div key={adv.id} className="text-sm border border-border rounded p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <SeverityBadge severity={adv.severity} />
                  {adv.cvss_score != null && (
                    <span className="text-xs text-text-muted tabular-nums">CVSS {adv.cvss_score}</span>
                  )}
                  {adv.cve_id && (
                    <code className="text-xs text-text-muted">{adv.cve_id}</code>
                  )}
                  <span className={`text-xs ml-auto ${adv.status === 'fixed' ? 'text-green' : 'text-red'}`}>
                    {adv.status === 'fixed' ? 'Fixed' : 'Open'}
                  </span>
                </div>
                <p className="text-text-primary mt-1">{adv.title}</p>
                {adv.description && (
                  <p className="text-text-muted text-xs mt-1 line-clamp-2">{adv.description}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-text-muted">
                  {adv.affected_versions && (
                    <span>Affected: <code>{adv.affected_versions}</code></span>
                  )}
                  {adv.fixed_version && (
                    <span className="text-green">Fixed in <code>{adv.fixed_version}</code></span>
                  )}
                  {adv.published_at && (
                    <span>Published {new Date(adv.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  )}
                  {adv.source_url && (
                    <a href={adv.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
                      source \u2192
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border mt-3 pt-2 text-xs text-text-muted">
        CVEs checked daily via{' '}
        <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">OSV.dev</a>.
        {' '}Score algorithm is{' '}
        <Link href="/methodology" className="text-accent hover:text-accent-hover">open source</Link>.
      </div>
    </div>
  )
}
