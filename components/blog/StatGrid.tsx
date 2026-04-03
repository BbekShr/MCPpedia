export function Stat(props: Record<string, unknown>) {
  const value = String(props.value || '')
  const label = String(props.label || '')
  const detail = props.detail ? String(props.detail) : null
  return (
    <div className="text-center p-4">
      <div className="text-2xl md:text-3xl font-bold text-accent tracking-tight">{value}</div>
      <div className="text-sm font-semibold text-text-primary mt-1">{label}</div>
      {detail && <div className="text-xs text-text-muted mt-0.5">{detail}</div>}
    </div>
  )
}

export default function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose my-8 grid grid-cols-2 md:grid-cols-3 gap-1 rounded-xl border border-border bg-bg-secondary overflow-hidden divide-x divide-border [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-border md:[&>*:nth-child(3)]:border-t-0">
      {children}
    </div>
  )
}
