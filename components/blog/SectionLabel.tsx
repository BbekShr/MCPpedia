export default function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose mt-14 mb-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-bold uppercase tracking-widest text-text-muted">{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
