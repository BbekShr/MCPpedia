import Link from 'next/link'
import { SITE_URL, SITE_NAME } from '@/lib/constants'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `MCPpedia Security Badges — Show your MCP server's score`,
  description: 'Add MCPpedia security badges to your GitHub README. Show your MCP server\'s overall score and security grade, backed by daily CVE scanning.',
  openGraph: {
    title: 'MCPpedia Security Badges',
    description: 'Add MCPpedia security badges to your GitHub README.',
    url: `${SITE_URL}/badge`,
  },
  alternates: { canonical: `${SITE_URL}/badge` },
}

const EXAMPLE_GRADES = [
  { score: 88, secScore: 28, cves: 0, grade: 'A', color: '#1a7f37', label: 'Excellent' },
  { score: 65, secScore: 21, cves: 1, grade: 'B', color: '#0969da', label: 'Good' },
  { score: 45, secScore: 14, cves: 2, grade: 'C', color: '#9a6700', label: 'Fair' },
  { score: 22, secScore: 6, cves: 5, grade: 'D', color: '#cf222e', label: 'Poor' },
]

function ScoreBadgeSVG({ score }: { score: number }) {
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  const color = score >= 80 ? '#1a7f37' : score >= 60 ? '#0969da' : score >= 40 ? '#9a6700' : '#cf222e'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="170" height="20" role="img">
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
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="20" role="img">
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

export default function BadgePage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight mb-3">
          {SITE_NAME} Security Badges
        </h1>
        <p className="text-lg text-text-muted max-w-xl">
          Show your MCP server&apos;s security posture directly in your GitHub README.
          Badges update automatically as scores change — no manual maintenance.
        </p>
      </div>

      {/* Badge types */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-text-primary mb-6">Badge types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border rounded-lg p-5 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Overall Score</h3>
            <div className="mb-3">
              <ScoreBadgeSVG score={82} />
            </div>
            <p className="text-xs text-text-muted mb-2">
              Shows the MCPpedia score (0–100) covering security, maintenance, documentation, compatibility, and token efficiency.
            </p>
            <code className="text-xs bg-code-bg border border-border rounded px-2 py-1 block break-all">
              /api/badge/YOUR-SLUG
            </code>
          </div>

          <div className="border border-border rounded-lg p-5 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Security Grade</h3>
            <div className="mb-3">
              <SecurityBadgeSVG secScore={28} cves={0} />
            </div>
            <p className="text-xs text-text-muted mb-2">
              Shows the security-specific grade (A–F) from daily CVE scanning, plus the number of open CVEs.
            </p>
            <code className="text-xs bg-code-bg border border-border rounded px-2 py-1 block break-all">
              /api/badge/YOUR-SLUG?type=security
            </code>
          </div>
        </div>
      </section>

      {/* Grade examples */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-text-primary mb-6">Grade scale</h2>
        <div className="space-y-3">
          {EXAMPLE_GRADES.map(ex => (
            <div key={ex.grade} className="flex items-center gap-4">
              <div className="w-24 shrink-0">
                <ScoreBadgeSVG score={ex.score} />
              </div>
              <div className="w-32 shrink-0">
                <SecurityBadgeSVG secScore={ex.secScore} cves={ex.cves} />
              </div>
              <div className="text-sm text-text-muted">{ex.label} — score {ex.score}+</div>
            </div>
          ))}
        </div>
      </section>

      {/* How to add */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-text-primary mb-4">How to add a badge</h2>
        <ol className="space-y-4 text-sm text-text-muted">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
            <div>
              <p className="text-text-primary font-medium mb-1">Find your server on MCPpedia</p>
              <p>Search for your server at <Link href="/servers" className="text-accent hover:text-accent-hover">mcppedia.org/servers</Link> or <Link href="/submit" className="text-accent hover:text-accent-hover">submit it</Link> if it&apos;s not listed yet.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
            <div>
              <p className="text-text-primary font-medium mb-1">Copy the badge snippet</p>
              <p>On the server&apos;s page, scroll to the Score Breakdown section and click <strong>Copy</strong> next to the markdown snippet.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
            <div>
              <p className="text-text-primary font-medium mb-1">Paste into your README</p>
              <p>Add it near the top of your README alongside other status badges. Example:</p>
              <div className="mt-2 bg-code-bg border border-border rounded p-3 font-mono text-xs text-text-muted break-all">
                {'[![MCPpedia Score](https://mcppedia.org/api/badge/your-slug)](https://mcppedia.org/s/your-slug)'}
              </div>
            </div>
          </li>
        </ol>
      </section>

      {/* CTA */}
      <div className="border border-accent/20 rounded-lg p-6 bg-accent/5">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Is your server listed?</h2>
        <p className="text-sm text-text-muted mb-4">
          MCPpedia tracks {/* dynamic */}thousands of MCP servers with daily security scanning. Find yours or add it now.
        </p>
        <div className="flex gap-3">
          <Link href="/servers" className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors">
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
