import Link from 'next/link'
import type { Server } from '@/lib/types'
import HealthBadge from './HealthBadge'
import CategoryTag from './CategoryTag'
import ServerIcon from './ServerIcon'
import type { HealthStatus } from '@/lib/constants'

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
  return `${months}mo ago`
}

const healthBorderColors: Record<string, string> = {
  active: 'border-l-green',
  maintained: 'border-l-green',
  stale: 'border-l-yellow',
  abandoned: 'border-l-red',
  archived: 'border-l-red',
  unknown: 'border-l-border',
}

export default function ServerCard({ server }: { server: Server }) {
  const toolCount = server.tools?.length || 0
  const transportLabel = server.transport?.join('/') || 'stdio'
  const score = server.score_total || 0
  const healthBorder = healthBorderColors[server.health_status] || 'border-l-border'

  return (
    <Link
      href={`/s/${server.slug}`}
      className={`block border border-border border-l-[3px] ${healthBorder} rounded-md p-4 bg-bg hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-[1px] transition-all duration-150`}
      aria-label={`${server.name} — score ${score}, ${server.health_status}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5">
          <ServerIcon
            name={server.name}
            homepageUrl={server.homepage_url}
            authorGithub={server.author_github}
            size={28}
          />
          <h3 className="font-semibold text-text-primary leading-tight text-[15px]">{server.name}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {server.author_type === 'official' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Official</span>
          )}
          {score > 0 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              score >= 80 ? 'bg-green/10 text-green' :
              score >= 60 ? 'bg-accent/10 text-accent' :
              score >= 40 ? 'bg-yellow/10 text-yellow' :
              'bg-red/10 text-red'
            }`}>
              {score}
            </span>
          )}
          <HealthBadge status={server.health_status as HealthStatus} />
        </div>
      </div>

      {server.tagline && (
        <p className="text-sm text-text-muted mb-3 line-clamp-2">{server.tagline}</p>
      )}

      {server.categories.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {server.categories.slice(0, 3).map(cat => (
            <CategoryTag key={cat} category={cat} linked={false} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        {toolCount > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            {toolCount} tools
          </span>
        )}
        <span className="shrink-0">{transportLabel}</span>
        {server.github_stars > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {formatNumber(server.github_stars)}
          </span>
        )}
        {server.npm_weekly_downloads > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {formatNumber(server.npm_weekly_downloads)}/wk
          </span>
        )}
        {server.api_pricing && server.api_pricing !== 'unknown' && (
          <span className="capitalize shrink-0">{server.api_pricing}</span>
        )}
        {server.updated_at && (
          <span className="shrink-0">Updated {timeAgo(server.updated_at)}</span>
        )}
      </div>
    </Link>
  )
}
