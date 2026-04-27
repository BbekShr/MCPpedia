import Link from 'next/link'
import type { Server } from '@/lib/types'
import ServerIcon from './ServerIcon'
import ScoreBadge from './ScoreBadge'
import CopyConfigButton from './CopyConfigButton'
import FavoriteButton from './FavoriteButton'
import CompareToggleButton from './CompareToggleButton'

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export default function ServerCard({ server }: { server: Server }) {
  const toolCount = server.tools?.length || 0
  const score = server.score_total || 0
  const transports = server.transport || []
  const hasRemote = transports.includes('http') || transports.includes('sse')
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  const a11yLabel = `${server.name} — score ${score}/100, grade ${grade}, ${server.cve_count === 0 ? 'no CVEs' : `${server.cve_count} CVEs`}, ${server.health_status || 'unknown'} status`

  // Overlay-link pattern: the card is <article>, a stretched invisible <Link>
  // covers it for whole-card navigation, and interactive children sit above
  // the overlay so they get clicks independently. No stopPropagation needed,
  // and screen readers announce a proper article with link + buttons.
  return (
    <article className="group relative block border border-border rounded-md p-4 bg-bg hover:shadow-[var(--shadow-card-hover),inset_3px_0_0_var(--accent)] hover:-translate-y-[1px] transition-all duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-accent">
      <Link
        href={`/s/${server.slug}`}
        aria-label={a11yLabel}
        className="absolute inset-0 z-0 rounded-md"
      >
        <span className="sr-only">View {server.name}</span>
      </Link>

      {/* Row 1: Icon + name + favorite */}
      <div className="relative z-10 flex items-start gap-2.5 mb-2 pointer-events-none">
        <ServerIcon
          name={server.name}
          homepageUrl={server.homepage_url}
          authorGithub={server.author_github}
          size={28}
        />
        <h3 className="flex-1 min-w-0 font-semibold text-text-primary leading-tight text-[15px] line-clamp-2 pt-0.5">{server.name}</h3>
        <div className="pointer-events-auto relative z-20 flex items-center gap-0.5 shrink-0">
          <CompareToggleButton
            item={{
              id: server.id,
              slug: server.slug,
              name: server.name,
              score_total: server.score_total || 0,
            }}
            className="p-1 -m-1 text-text-muted"
          />
          <FavoriteButton serverId={server.id} className="p-1 -m-1 text-text-muted" />
        </div>
      </div>

      {/* Row 2: Badges */}
      <div className="relative z-10 flex flex-wrap items-center gap-1.5 mb-2 pointer-events-none">
        {server.author_type === 'official' && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Official</span>
        )}
        {server.cve_count === 0 ? (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-green/10 text-green font-medium">No CVEs</span>
        ) : (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-red/10 text-red font-medium">{server.cve_count} CVE{server.cve_count !== 1 ? 's' : ''}</span>
        )}
        {score > 0 && <ScoreBadge score={score} size="sm" />}
      </div>

      {/* Row 3: Tagline */}
      {server.tagline && (
        <p className="relative z-10 text-sm text-text-muted mb-2.5 line-clamp-1 pointer-events-none">{server.tagline}</p>
      )}

      {/* Row 4: Key signals + copy config */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted pointer-events-none">
        {toolCount > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            {toolCount} tools
          </span>
        )}
        <span className="shrink-0">{hasRemote ? 'remote' : transports[0] || 'stdio'}</span>
        {server.github_stars > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {formatNumber(server.github_stars)}
          </span>
        )}
        {server.npm_weekly_downloads > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {formatNumber(server.npm_weekly_downloads)}/wk
          </span>
        )}
        {server.github_last_commit && (
          <span className="shrink-0">{timeAgo(server.github_last_commit)}</span>
        )}
        <span className="flex-1" />
        <div className="pointer-events-auto relative z-20">
          <CopyConfigButton
            configs={server.install_configs as Record<string, unknown>}
            serverName={server.name}
          />
        </div>
      </div>
    </article>
  )
}
