import type { HealthStatus } from '@/lib/constants'

const config: Record<HealthStatus, { color: string; label: string }> = {
  active:     { color: 'bg-green',  label: 'Active' },
  maintained: { color: 'bg-green',  label: 'Maintained' },
  stale:      { color: 'bg-yellow', label: 'Stale' },
  abandoned:  { color: 'bg-red',    label: 'Abandoned' },
  archived:   { color: 'bg-red',    label: 'Archived' },
  unknown:    { color: 'bg-text-muted', label: 'Unknown' },
}

export default function HealthBadge({ status }: { status: HealthStatus }) {
  const { color, label } = config[status] || config.unknown

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
