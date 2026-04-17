import Link from 'next/link'
import { SITE_URL, SITE_NAME } from '@/lib/constants'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import BadgePreview from '@/components/BadgePreview'

export const metadata: Metadata = {
  title: `MCPpedia Security Badges — Show your MCP server's score`,
  description: 'Add MCPpedia security badges to your GitHub README. Show your MCP server\'s overall score and security grade, backed by daily CVE scanning.',
  openGraph: {
    title: 'MCPpedia Security Badges',
    description: 'Add MCPpedia security badges to your GitHub README. Automatic updates, zero maintenance.',
    url: `${SITE_URL}/badge`,
  },
  alternates: { canonical: `${SITE_URL}/badge` },
}

const EXAMPLE_GRADES = [
  { score: 88, secScore: 28, cves: 0, grade: 'A', label: 'Excellent', desc: 'Top-tier security and maintenance' },
  { score: 65, secScore: 21, cves: 1, grade: 'B', label: 'Good', desc: 'Solid fundamentals, minor issues' },
  { score: 45, secScore: 14, cves: 2, grade: 'C', label: 'Fair', desc: 'Usable but needs attention' },
  { score: 22, secScore: 6, cves: 5, grade: 'D', label: 'Poor', desc: 'Significant security concerns' },
]

function ScoreBadgeSVG({ score }: { score: number }) {
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  const color = score >= 80 ? '#1a7f37' : score >= 60 ? '#0969da' : score >= 40 ? '#9a6700' : '#cf222e'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="170" height="20" role="img" aria-label={`MCPpedia score: ${score}/100 grade ${grade}`}>
      <linearGradient id={`s${score}`} x2="0" y2="100%">
        <stop offset="0" stopColor="#bbb" stopOpacity=".1"/>
        <stop offset="1" stopOpacity=".1"/>
      </linearGradient>
      <clipPath id={`r${score}`}>
        <rect width="170" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clipPath={`url(#r${score})`}>
        <rect width="90" height="20" fill="#555"/>
        <rect x="90" width="80" height="20" fill={color}/>
        <rect width="170" height="20" fill={`url(#s${score})`}/>
      </g>
      <g fill="#fff" textAnchor="middle" fontFamily="Verdana,Geneva,DejaVu Sans,sans-serif" fontSize="11">
        <text x="45" y="15" fill="#010101" fillOpacity=".3">MCPpedia</text>
        <text x="45" y="14">MCPpedia</text>
        <text x="130" y="15" fill="#010101" fillOpacity=".3">{score}/100 ({grade})</text>
        <text x="130" y="14">{score}/100 ({grade})</text>
      </g>
    </svg>
  )
}

function SecurityBadgeSVG({ secScore, cves }: { secScore: number; cves: number }) {
  const grade = secScore >= 27 ? 'A' : secScore >= 21 ? 'B' : secScore >= 15 ? 'C' : secScore >= 9 ? 'D' : 'F'
  const color = secScore >= 27 ? '#1a7f37' : secScore >= 21 ? '#0969da' : secScore >= 15 ? '#9a6700' : '#cf222e'
  const cveText = cves === 0 ? 'no CVEs' : `${cves} CVE${cves !== 1 ? 's' : ''}`
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="20" role="img" aria-label={`Security grade ${grade}, ${cveText}`}>
      <linearGradient id={`sec${secScore}`} x2="0" y2="100%">
        <stop offset="0" stopColor="#bbb" stopOpacity=".1"/>
        <stop offset="1" stopOpacity=".1"/>
      </linearGradient>
      <clipPath id={`rsec${secScore}`}>
        <rect width="160" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clipPath={`url(#rsec${secScore})`}>
        <rect width="80" height="20" fill="#555"/>
        <rect x="80" width="80" height="20" fill={color}/>
        <rect width="160" height="20" fill={`url(#sec${secScore})`}/>
      </g>
      <g fill="#fff" textAnchor="middle" fontFamily="Verdana,Geneva,DejaVu Sans,sans-serif" fontSize="11">
        <text x="40" y="15" fill="#010101" fillOpacity=".3">security</text>
        <text x="40" y="14">security</text>
        <text x="120" y="15" fill="#010101" fillOpacity=".3">{grade} · {cveText}</text>
        <text x="120" y="14">{grade} · {cveText}</text>
      </g>
    </svg>
  )
}

export default async function BadgePage() {
  // Fetch real server count
  const supabase = createPublicClient()
  const { count } = await supabase
    .from('servers')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)
  const serverCount = count || 17000

  // Fetch a few popular servers for "Try it" examples
  const { data: popularServers } = await supabase
    .from('servers')
    .select('slug, name, score_total')
    .eq('is_archived', false)
    .gt('score_total', 70)
    .order('npm_weekly_downloads', { ascending: false })
    .limit(6)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'MCPpedia Security Badges',
    description: 'Add MCPpedia security badges to your GitHub README.',
    url: `${SITE_URL}/badge`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Security Badges' },
      ],
    },
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="text-sm text-text-muted mb-8">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-accent">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-text-primary">Security Badges</li>
        </ol>
      </nav>

      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight mb-3">
          {SITE_NAME} Security Badges
        </h1>
        <p className="text-lg text-text-muted max-w-2xl">
          Show your MCP server&apos;s security posture directly in your GitHub README.
          Badges update automatically as scores change — zero maintenance required.
        </p>
      </div>

      {/* Badge types — 3 styles */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-text-primary mb-6">Badge styles</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Flat score badge */}
          <div className="border border-border rounded-lg p-5 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Overall Score</h3>
            <div className="mb-3 flex items-center min-h-[24px]">
              <ScoreBadgeSVG score={82} />
            </div>
            <p className="text-xs text-text-muted mb-3">
              Combined MCPpedia score (0–100) covering security, maintenance, docs, compatibility, and efficiency.
            </p>
            <code className="text-xs bg-code-bg border border-border rounded px-2 py-1.5 block break-all font-mono">
              /api/badge/<span className="text-accent">YOUR-SLUG</span>
            </code>
          </div>

          {/* Security badge */}
          <div className="border border-border rounded-lg p-5 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Security Grade</h3>
            <div className="mb-3 flex items-center min-h-[24px]">
              <SecurityBadgeSVG secScore={28} cves={0} />
            </div>
            <p className="text-xs text-text-muted mb-3">
              Security-specific grade (A–F) from daily CVE scanning, plus open CVE count.
            </p>
            <code className="text-xs bg-code-bg border border-border rounded px-2 py-1.5 block break-all font-mono">
              /api/badge/<span className="text-accent">YOUR-SLUG</span>?type=security
            </code>
          </div>

          {/* Detailed widget */}
          <div className="border border-border rounded-lg p-5 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Detailed Card</h3>
            <div className="mb-3 flex items-center min-h-[24px]">
              {/* Inline preview of the detailed badge style */}
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="56" viewBox="0 0 280 80" role="img" aria-label="Detailed MCPpedia badge card">
                <rect x="0.5" y="0.5" width="279" height="79" fill="#ffffff" stroke="#d0d7de" strokeWidth="1" rx="8" />
                <text x="12" y="22" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="13" fontWeight="bold" fill="#1f2328">your-server</text>
                <text x="12" y="52" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="20" fontWeight="bold" fill="#1a7f37">82</text>
                <text x="50" y="46" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="11" fill="#656d76">/ 100</text>
                <text x="50" y="58" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="11" fill="#656d76">Grade A</text>
                <text x="130" y="46" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="11" fill="#656d76">CVEs: <tspan fill="#1a7f37" fontWeight="bold">0</tspan></text>
                <text x="130" y="58" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="11" fill="#656d76">Status: <tspan fontWeight="bold">healthy</tspan></text>
                <text x="12" y="74" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontSize="9" fill="#8b949e">Verified by MCPpedia.org</text>
              </svg>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Richer card showing score, grade, CVEs, and health status. Great for project pages.
            </p>
            <code className="text-xs bg-code-bg border border-border rounded px-2 py-1.5 block break-all font-mono">
              /api/widget/<span className="text-accent">YOUR-SLUG</span>?style=detailed
            </code>
          </div>
        </div>
      </section>

      {/* Try it — live preview */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Try it live</h2>
        <p className="text-sm text-text-muted mb-5">
          Search for a server or click one below to preview badges and copy the snippet.
        </p>
        <BadgePreview
          popularServers={(popularServers || []).map((s: { slug: string; name: string; score_total: number }) => ({ slug: s.slug, name: s.name, score: s.score_total }))}
        />
      </section>

      {/* Grade scale */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-text-primary mb-6">Grade scale</h2>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-secondary border-b border-border">
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Grade</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Score Badge</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Security Badge</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_GRADES.map(ex => (
                <tr key={ex.grade} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold" style={{ color: ex.score >= 80 ? '#1a7f37' : ex.score >= 60 ? '#0969da' : ex.score >= 40 ? '#9a6700' : '#cf222e' }}>
                      {ex.grade}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadgeSVG score={ex.score} />
                  </td>
                  <td className="px-4 py-3">
                    <SecurityBadgeSVG secScore={ex.secScore} cves={ex.cves} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-text-primary">{ex.label}</p>
                    <p className="text-xs text-text-muted">{ex.desc}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* How to add */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-text-primary mb-6">How to add a badge</h2>
        <div className="space-y-6">
          <div className="flex gap-4">
            <span className="w-8 h-8 rounded-full bg-accent text-accent-fg text-sm font-bold flex items-center justify-center shrink-0">1</span>
            <div>
              <p className="text-text-primary font-medium mb-1">Find your server on MCPpedia</p>
              <p className="text-sm text-text-muted">
                Search for your server at <Link href="/servers" className="text-accent hover:text-accent-hover underline">mcppedia.org/servers</Link> or <Link href="/submit" className="text-accent hover:text-accent-hover underline">submit it</Link> if it&apos;s not listed yet.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <span className="w-8 h-8 rounded-full bg-accent text-accent-fg text-sm font-bold flex items-center justify-center shrink-0">2</span>
            <div>
              <p className="text-text-primary font-medium mb-1">Copy the badge snippet</p>
              <p className="text-sm text-text-muted mb-2">
                Use the &quot;Try it live&quot; section above, or on any server page scroll to Score Breakdown and click <strong>Copy</strong>.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <span className="w-8 h-8 rounded-full bg-accent text-accent-fg text-sm font-bold flex items-center justify-center shrink-0">3</span>
            <div>
              <p className="text-text-primary font-medium mb-1">Paste into your README</p>
              <p className="text-sm text-text-muted mb-3">
                Add it near the top of your README alongside other status badges.
              </p>
              <div className="bg-code-bg border border-border rounded-lg p-4">
                <p className="text-xs text-text-muted mb-2 font-medium">Markdown:</p>
                <code className="text-xs text-text-primary font-mono break-all leading-relaxed">
                  {'[![MCPpedia Score](https://mcppedia.org/api/badge/your-slug)](https://mcppedia.org/s/your-slug)'}
                </code>
                <div className="border-t border-border mt-3 pt-3">
                  <p className="text-xs text-text-muted mb-2 font-medium">HTML:</p>
                  <code className="text-xs text-text-primary font-mono break-all leading-relaxed">
                    {'<a href="https://mcppedia.org/s/your-slug"><img src="https://mcppedia.org/api/badge/your-slug" alt="MCPpedia Score" /></a>'}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API details */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold text-text-primary mb-4">API reference</h2>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary border-b border-border">
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Endpoint</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Parameters</th>
                <th className="px-4 py-2.5 text-xs font-medium text-text-muted text-left">Returns</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-4 py-3 font-mono text-xs">/api/badge/:slug</td>
                <td className="px-4 py-3 text-xs text-text-muted"><code>type=security</code> (optional)</td>
                <td className="px-4 py-3 text-xs text-text-muted">SVG flat badge</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs">/api/widget/:slug</td>
                <td className="px-4 py-3 text-xs text-text-muted"><code>style=flat|detailed</code></td>
                <td className="px-4 py-3 text-xs text-text-muted">SVG badge or card widget</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-muted mt-3">
          All badge endpoints return SVG with CORS headers enabled. Cached for 1 hour. Free to use — no API key needed.
        </p>
      </section>

      {/* CTA */}
      <div className="border border-accent/20 rounded-lg p-6 bg-accent/5">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Is your server listed?</h2>
        <p className="text-sm text-text-muted mb-4">
          MCPpedia tracks {serverCount.toLocaleString()} MCP servers with daily security scanning. Find yours or add it now.
        </p>
        <div className="flex gap-3">
          <Link href="/servers" className="px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors">
            Search servers
          </Link>
          <Link href="/submit" className="px-4 py-2 text-sm rounded-md border border-border text-text-primary hover:bg-bg-tertiary transition-colors">
            Submit your server
          </Link>
        </div>
      </div>
    </div>
  )
}
