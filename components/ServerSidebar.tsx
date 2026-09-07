import Link from 'next/link'
import type { Server } from '@/lib/types'
import { SCORE_WEIGHTS } from '@/lib/scoring'
import { Icon } from '@/components/ui/icons'
import { Brand } from '@/components/ui/brand-marks'

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const cleaned = url.replace(/^git\+/, '').replace(/\.git$/, '')
  try {
    const p = new URL(cleaned)
    return p.protocol === 'https:' || p.protocol === 'http:' ? cleaned : null
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
                <Brand name="github" size={14} />
                GitHub
              </a>
            )}
            {s.npm_package && (
              <a href={`https://www.npmjs.com/package/${s.npm_package}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <Brand name="npm" size={14} />
                npm
              </a>
            )}
            {s.pip_package && (
              <a href={`https://pypi.org/project/${s.pip_package}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <Brand name="pypi" size={14} />
                PyPI
              </a>
            )}
            {safeUrl(s.homepage_url) && (
              <a href={safeUrl(s.homepage_url)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
                <Icon name="globe" size={14} />
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
