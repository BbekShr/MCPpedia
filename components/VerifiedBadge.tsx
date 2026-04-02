export default function VerifiedBadge({ type }: { type: 'publisher' | 'mcppedia' | 'registry' }) {
  const config = {
    publisher: {
      label: 'Verified Publisher',
      color: 'bg-accent/10 text-accent',
      icon: '✓',
    },
    mcppedia: {
      label: 'MCPpedia Verified',
      color: 'bg-green/10 text-green',
      icon: '★',
    },
    registry: {
      label: 'Official Registry',
      color: 'bg-accent/10 text-accent',
      icon: '◆',
    },
  }

  const { label, color, icon } = config[type]

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${color}`}>
      <span>{icon}</span>
      {label}
    </span>
  )
}
