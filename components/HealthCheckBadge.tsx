interface Props {
  status: string | null
  checkedAt: string | null
  uptime: number
}

export default function HealthCheckBadge({ status, checkedAt, uptime }: Props) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        <span className="w-2 h-2 rounded-full bg-border" />
        Not tested
      </span>
    )
  }

  const config: Record<string, { color: string; label: string }> = {
    pass: { color: 'bg-green', label: 'Working' },
    fail: { color: 'bg-red', label: 'Failing' },
    timeout: { color: 'bg-yellow', label: 'Timeout' },
    error: { color: 'bg-red', label: 'Error' },
  }

  const { color, label } = config[status] || config.error

  const timeAgo = checkedAt
    ? (() => {
        // eslint-disable-next-line react-hooks/purity
        const mins = Math.floor((Date.now() - new Date(checkedAt).getTime()) / 60000)
        if (mins < 60) return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs}h ago`
        return `${Math.floor(hrs / 24)}d ago`
      })()
    : ''

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`w-2 h-2 rounded-full ${color} ${status === 'pass' ? 'animate-pulse' : ''}`} />
      {label}
      {timeAgo && <span className="text-text-muted">({timeAgo})</span>}
      {uptime > 0 && <span className="text-text-muted">&middot; {uptime.toFixed(0)}% uptime</span>}
    </span>
  )
}
