import type { Server, SecurityAdvisory } from '@/lib/types'

export default function SecurityCard({
  server,
  advisories,
}: {
  server: Server
  advisories: SecurityAdvisory[]
}) {
  const openAdvisories = advisories.filter(a => a.status === 'open')
  const criticalCount = openAdvisories.filter(a => a.severity === 'critical' || a.severity === 'high').length

  return (
    <div className="border border-border rounded-md p-4">
      <h3 className="font-semibold text-text-primary mb-3">Security</h3>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {server.cve_count === 0 ? (
          <span className="text-xs px-2 py-1 rounded bg-green/10 text-green font-medium">No known CVEs</span>
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-red/10 text-red font-medium">
            {server.cve_count} CVE{server.cve_count !== 1 ? 's' : ''}
          </span>
        )}
        {server.has_authentication ? (
          <span className="text-xs px-2 py-1 rounded bg-green/10 text-green font-medium">Has auth</span>
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-yellow/10 text-yellow font-medium">No auth</span>
        )}
        {server.security_verified && (
          <span className="text-xs px-2 py-1 rounded bg-accent/10 text-accent font-medium">Verified</span>
        )}
        {server.license && server.license !== 'NOASSERTION' && (
          <span className="text-xs px-2 py-1 rounded bg-bg-tertiary text-text-muted">{server.license}</span>
        )}
      </div>

      {/* Quick stats */}
      <dl className="space-y-1 text-sm mb-4">
        <div className="flex justify-between">
          <dt className="text-text-muted">Authentication</dt>
          <dd className="text-text-primary">{server.has_authentication ? 'Required' : 'None'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-muted">Open CVEs</dt>
          <dd className={openAdvisories.length > 0 ? 'text-red font-medium' : 'text-text-primary'}>
            {openAdvisories.length}
          </dd>
        </div>
        {criticalCount > 0 && (
          <div className="flex justify-between">
            <dt className="text-text-muted">Critical/High</dt>
            <dd className="text-red font-medium">{criticalCount}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-text-muted">License</dt>
          <dd className="text-text-primary">{server.license && server.license !== 'NOASSERTION' ? server.license : 'Not specified'}</dd>
        </div>
      </dl>

      {/* Advisory list */}
      {openAdvisories.length > 0 && (
        <div className="border-t border-border pt-3">
          <h4 className="text-sm font-medium text-text-primary mb-2">Open Advisories</h4>
          <div className="space-y-2">
            {openAdvisories.map(adv => {
              const severityColor = adv.severity === 'critical' ? 'bg-red text-white'
                : adv.severity === 'high' ? 'bg-red/80 text-white'
                : adv.severity === 'medium' ? 'bg-yellow text-white'
                : 'bg-bg-tertiary text-text-muted'

              return (
                <div key={adv.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${severityColor}`}>
                      {adv.severity}
                    </span>
                    {adv.cve_id && <code className="text-xs text-text-muted">{adv.cve_id}</code>}
                  </div>
                  <p className="text-text-primary mt-0.5">{adv.title}</p>
                  {adv.fixed_version && (
                    <p className="text-xs text-green mt-0.5">Fixed in {adv.fixed_version}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
