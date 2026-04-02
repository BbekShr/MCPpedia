import Link from 'next/link'
import type { Server } from '@/lib/types'
import HealthBadge from './HealthBadge'
import CategoryTag from './CategoryTag'
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

export default function ServerCard({ server }: { server: Server }) {
  const toolCount = server.tools?.length || 0
  const transportLabel = server.transport?.join('/') || 'stdio'

  return (
    <Link
      href={`/s/${server.slug}`}
      className="block border border-border rounded-md p-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-150 bg-bg"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-text-primary leading-tight">{server.name}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {server.author_type === 'official' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Official</span>
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

      <div className="flex items-center gap-3 text-xs text-text-muted">
        {toolCount > 0 && <span>{toolCount} tools</span>}
        <span>{transportLabel}</span>
        {server.github_stars > 0 && <span>&#9733; {formatNumber(server.github_stars)}</span>}
        {server.npm_weekly_downloads > 0 && (
          <span>&#8595; {formatNumber(server.npm_weekly_downloads)}/wk</span>
        )}
        {server.api_pricing && server.api_pricing !== 'unknown' && (
          <span className="capitalize">{server.api_pricing}</span>
        )}
        {server.updated_at && (
          <span className="ml-auto">Updated {timeAgo(server.updated_at)}</span>
        )}
      </div>
    </Link>
  )
}
