import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-secondary mt-auto">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-accent">
              <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/>
              <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor"/>
              <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor"/>
              <path d="M8 15c1 1.5 3 2.5 4 2.5s3-1 4-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            MCPpedia — the free MCP encyclopedia.
          </div>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/submit" className="flex items-center gap-1.5 text-text-muted hover:text-text-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Contribute
            </Link>
            <Link href="/methodology" className="flex items-center gap-1.5 text-text-muted hover:text-text-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Methodology
            </Link>
            <Link href="/about" className="flex items-center gap-1.5 text-text-muted hover:text-text-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              About
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
