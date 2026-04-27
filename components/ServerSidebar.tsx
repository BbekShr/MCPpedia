import Link from 'next/link'
import type { Server } from '@/lib/types'
import { SCORE_WEIGHTS } from '@/lib/scoring'

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const p = new URL(url)
    return p.protocol === 'https:' || p.protocol === 'http:' ? url : null
  } catch { return null }
}

function timeAgo(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function ScoreRing({ score }: { score: number }) {
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  const color = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)'
  const gradeClass = score >= 70 ? 'text-green' : score >= 40 ? 'text-yellow' : 'text-red'
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 80, height: 80 }} role="img" aria-label={`Score: ${score} out of 100, grade ${grade}`}>
        <svg width={80} height={80} className="-rotate-90">
          <circle cx={40} cy={40} r={radius} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx={40} cy={40} r={radius} fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - filled}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold ${gradeClass}`}>{score}</span>
          <span className={`text-[10px] font-semibold ${gradeClass} -mt-0.5`}>{grade}</span>
        </div>
      </div>
      <Link href="/methodology" className="text-[11px] text-text-muted hover:text-accent mt-1">
        How we score
      </Link>
    </div>
  )
}

function Fact({ pass, label }: { pass: boolean | null; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className={`shrink-0 ${pass === true ? 'text-green' : pass === false ? 'text-red' : 'text-text-muted'}`}>
        {pass === true ? '\u2713' : pass === false ? '\u2717' : '\u25CB'}
      </span>
      <span className="text-text-muted">{label}</span>
    </div>
  )
}

export default function ServerSidebar({ server }: { server: Server }) {
  const s = server
  const toolCount = s.tools?.length || 0
  const transports = s.transport?.join(', ') || 'stdio'
  const grade = s.token_efficiency_grade !== 'unknown' ? s.token_efficiency_grade : null
  // RSC: Date.now() is called once per ISR render; parent page is cached via
  // `revalidate` so the value is stable for the cache window.
  const daysSinceCommit = s.github_last_commit
    // eslint-disable-next-line react-hooks/purity
    ? Math.floor((Date.now() - new Date(s.github_last_commit).getTime()) / 86400000)
    : null

  return (
    <aside className="w-72 shrink-0 hidden lg:block">
      <div className="sticky top-20 space-y-5">
        {/* Score ring */}
        <div className="border border-border rounded-md p-4 flex justify-center">
          <ScoreRing score={
            Math.min(s.score_security || 0, SCORE_WEIGHTS.security) +
            Math.min(s.score_maintenance || 0, SCORE_WEIGHTS.maintenance) +
            Math.min(s.score_efficiency || 0, SCORE_WEIGHTS.efficiency) +
            Math.min(s.score_documentation || 0, SCORE_WEIGHTS.documentation) +
            Math.min(s.score_compatibility || 0, SCORE_WEIGHTS.compatibility)
          } />
        </div>

        {/* Quick facts */}
        <div className="border border-border rounded-md p-4">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">At a glance</h3>
          <Fact
            pass={s.cve_count === 0}
            label={s.cve_count === 0 ? 'No known CVEs' : `${s.cve_count} CVE${s.cve_count !== 1 ? 's' : ''}`}
          />
          <Fact
            pass={s.health_status === 'active' || s.health_status === 'maintained'}
            label={daysSinceCommit !== null
              ? `${s.health_status === 'active' ? 'Active' : s.health_status} (${timeAgo(s.github_last_commit!)})`
              : s.health_status.charAt(0).toUpperCase() + s.health_status.slice(1)
            }
          />
          <Fact
            pass={null}
            label={`${toolCount} tool${toolCount !== 1 ? 's' : ''} \u00B7 ${transports}`}
          />
          <Fact
            pass={!!s.license && s.license !== 'NOASSERTION'}
            label={s.license && s.license !== 'NOASSERTION' ? s.license : 'No license'}
          />
          {grade && (
            <Fact
              pass={grade === 'A' || grade === 'B'}
              label={`Token grade: ${grade}`}
            />
          )}
          {s.has_authentication && (
            <Fact pass={true} label="Has authentication" />
          )}
        </div>

        {/* Links */}
        <div className="border border-border rounded-md p-4">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Links</h3>
          <div className="space-y-1.5">
            {safeUrl(s.github_url) && (
              <a href={safeUrl(s.github_url)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                GitHub
              </a>
            )}
            {s.npm_package && (
              <a href={`https://www.npmjs.com/package/${s.npm_package}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"/></svg>
                npm
              </a>
            )}
            {s.pip_package && (
              <a href={`https://pypi.org/project/${s.pip_package}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9.585 11.692h4.328s2.432.039 2.432-2.35V5.391S16.714 3 11.936 3C7.362 3 7.647 4.983 7.647 4.983l.006 2.055h4.363v.617H5.92s-2.927-.332-2.927 4.282 2.555 4.45 2.555 4.45h1.524v-2.141s-.083-2.554 2.513-2.554zm-.262-5.823a.784.784 0 110-1.568.784.784 0 010 1.568zM18.452 7.532h-1.524v2.141s.083 2.554-2.513 2.554h-4.328s-2.432-.04-2.432 2.35v3.951S7.286 21 12.064 21c4.574 0 4.289-1.983 4.289-1.983l-.006-2.055h-4.363v-.617h6.097s2.927.332 2.927-4.282-2.556-4.531-2.556-4.531zm-4.078 10.291a.784.784 0 110 1.568.784.784 0 010-1.568z"/></svg>
                PyPI
              </a>
            )}
            {safeUrl(s.homepage_url) && (
              <a href={safeUrl(s.homepage_url)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                Homepage
              </a>
            )}
          </div>
        </div>

        {/* Edit */}
        <Link
          href={`/s/${s.slug}/edit`}
          className="block text-center text-sm text-text-muted hover:text-text-primary border border-border rounded-md px-3 py-2 hover:bg-bg-tertiary transition-colors"
        >
          Edit this page
        </Link>
      </div>
    </aside>
  )
}
