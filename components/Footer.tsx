import Link from 'next/link'
import BlinkLogo from '@/components/BlinkLogo'

const GITHUB_URL = 'https://github.com/BbekShr/MCPpedia'

/** Footer columns — mirror the prototype's Catalog / Scoring / Security / Project layout. */
const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Catalog',
    links: [
      { label: 'All servers', href: '/servers' },
      { label: 'Categories', href: '/#categories' },
      { label: 'Leaderboard', href: '/servers?sort=downloads' },
      { label: 'New this week', href: '/servers?sort=newest' },
      { label: 'Submit a server', href: '/submit' },
    ],
  },
  {
    title: 'Scoring',
    links: [
      { label: 'How scoring works', href: '/methodology' },
      { label: 'Rubric', href: '/methodology#rubric' },
      { label: 'Report a mistake', href: `${GITHUB_URL}/issues/new`, external: true },
      { label: 'MCPpedia API (MCP)', href: '/mcp' },
    ],
  },
  {
    title: 'Security',
    links: [
      { label: 'All advisories', href: '/security' },
      {
        label: 'Report a vulnerability',
        href: `${GITHUB_URL}/security/advisories/new`,
        external: true,
      },
      { label: 'Security policy', href: `${GITHUB_URL}/security/policy`, external: true },
      { label: 'Score badges', href: '/methodology#badges' },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'About MCPpedia', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'Changelog', href: `${GITHUB_URL}/releases`, external: true },
      { label: 'Contribute on GitHub', href: GITHUB_URL, external: true },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg mt-auto">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-8 grid grid-cols-1 md:grid-cols-[1.4fr_3fr] gap-8">
        {/* Brand + tagline */}
        <div>
          <div className="inline-flex items-center gap-1.5 font-semibold text-[17px]">
            <BlinkLogo size={20} />
            <span className="text-text-primary">MCP</span>
            <span className="text-accent">pedia</span>
          </div>
          <p className="mt-2 text-[12.5px] text-text-muted leading-[1.5] max-w-[320px]">
            The open catalog for Model Context Protocol servers. Community-edited, source-available,
            no affiliate fees.
          </p>
          <div className="mt-3.5 font-mono text-[11px] text-text-muted">
            Scanning daily · Edits go live instantly
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {COLUMNS.map(col => (
            <div key={col.title}>
              <div
                className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-2"
              >
                {col.title}
              </div>
              <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                {col.links.map(l => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] text-text-primary hover:text-accent"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-[12.5px] text-text-primary hover:text-accent"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-muted)' }}>
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-3 flex flex-wrap justify-between gap-2 text-[11.5px] text-text-muted">
          <span>Content licensed CC BY-SA 4.0. Code MIT.</span>
          <span>Not affiliated with Anthropic or the MCP spec authors.</span>
        </div>
      </div>
    </footer>
  )
}
