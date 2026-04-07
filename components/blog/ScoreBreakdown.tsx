const maxPoints: Record<string, number> = {
  Security: 30,
  Maintenance: 25,
  Efficiency: 20,
  Documentation: 15,
  Compatibility: 10,
}

const colors: Record<string, { bar: string; bg: string; text: string }> = {
  Security: { bar: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  Maintenance: { bar: 'bg-yellow', bg: 'bg-yellow/10', text: 'text-yellow' },
  Efficiency: { bar: 'bg-accent', bg: 'bg-accent/10', text: 'text-accent' },
  Documentation: { bar: 'bg-green', bg: 'bg-green/10', text: 'text-green' },
  Compatibility: { bar: 'bg-accent', bg: 'bg-accent/10', text: 'text-accent' },
}

export function ScoreRow(props: Record<string, unknown>) {
  const label = String(props.label || '')
  const description = String(props.description || '')
  const pts = Number(props.points) || 0
  const c = colors[label] || colors.Efficiency

  return (
    <div className="flex items-start gap-4 py-4">
      <div className={`shrink-0 w-14 h-14 rounded-xl ${c.bg} flex flex-col items-center justify-center`}>
        <span className={`text-lg font-bold ${c.text} leading-none`}>{pts}</span>
        <span className={`text-[10px] ${c.text} opacity-70`}>/ {maxPoints[label] || 100}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-text-primary">{label}</div>
        <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</div>
      </div>
    </div>
  )
}

export default function ScoreBreakdown({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose my-8 rounded-xl border border-border bg-bg-secondary p-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">MCPpedia Scoring System</h4>
        <span className="text-xs text-text-muted">Total: 100 pts</span>
      </div>
      <div className="divide-y divide-border">
        {children}
      </div>
    </div>
  )
}
