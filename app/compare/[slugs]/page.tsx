import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import ScoreCard from '@/components/ScoreCard'
import HealthBadge from '@/components/HealthBadge'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import type { HealthStatus } from '@/lib/constants'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'

export const revalidate = 86400

// ---------- Static Params (pre-generate comparison pages for SEO) ----------

interface ComparisonPair {
  slugA: string
  slugB: string
  nameA: string
  nameB: string
  category?: string
}

function loadComparisonPairs(): ComparisonPair[] {
  try {
    const filePath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return data.pairs || []
  } catch {
    return []
  }
}

export async function generateStaticParams() {
  const pairs = loadComparisonPairs()
  return pairs.map(p => ({
    slugs: `${p.slugA}-vs-${p.slugB}`,
  }))
}

// ---------- Metadata ----------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugs: string }>
}): Promise<Metadata> {
  const { slugs } = await params
  const [slugA, slugB] = slugs.split('-vs-')
  if (!slugA || !slugB) return { title: 'Compare MCP Servers' }

  const supabase = createPublicClient()
  const [{ data: serverA }, { data: serverB }] = await Promise.all([
    supabase.from('servers').select('name, tagline, score_total').eq('slug', slugA).single(),
    supabase.from('servers').select('name, tagline, score_total').eq('slug', slugB).single(),
  ])

  const nameA = serverA?.name || slugA
  const nameB = serverB?.name || slugB
  const scoreA = serverA?.score_total || 0
  const scoreB = serverB?.score_total || 0

  const title = `${nameA} vs ${nameB} — MCP Server Comparison`
  const description = `Compare ${nameA} (score: ${scoreA}) and ${nameB} (score: ${scoreB}) MCP servers side-by-side. See security scores, tools, maintenance, downloads, and compatibility.`

  return {
    title,
    description,
    alternates: {
      canonical: `https://mcppedia.org/compare/${slugs}`,
    },
    openGraph: {
      title,
      description,
      url: `https://mcppedia.org/compare/${slugs}`,
      type: 'website',
    },
  }
}

// ---------- Helpers ----------

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function getGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

function CompareRow({ label, valA, valB, higherIsBetter = true }: {
  label: string
  valA: string | number
  valB: string | number
  higherIsBetter?: boolean
}) {
  const numA = typeof valA === 'number' ? valA : 0
  const numB = typeof valB === 'number' ? valB : 0
  const aWins = higherIsBetter ? numA > numB : numA < numB
  const bWins = higherIsBetter ? numB > numA : numB < numA

  return (
    <tr className="border-b border-border">
      <td className={`px-3 py-2 text-sm text-right ${aWins ? 'text-green font-medium' : 'text-text-primary'}`}>
        {typeof valA === 'number' ? formatNumber(valA) : valA}
      </td>
      <td className="px-3 py-2 text-sm text-center text-text-muted">{label}</td>
      <td className={`px-3 py-2 text-sm ${bWins ? 'text-green font-medium' : 'text-text-primary'}`}>
        {typeof valB === 'number' ? formatNumber(valB) : valB}
      </td>
    </tr>
  )
}

// ---------- Page ----------

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slugs: string }>
}) {
  const { slugs } = await params
  const parts = slugs.split('-vs-')

  if (parts.length !== 2) notFound()

  const [slugA, slugB] = parts
  const supabase = createPublicClient()

  const [{ data: serverA }, { data: serverB }] = await Promise.all([
    supabase.from('servers').select(PUBLIC_SERVER_FIELDS).eq('slug', slugA).single(),
    supabase.from('servers').select(PUBLIC_SERVER_FIELDS).eq('slug', slugB).single(),
  ])

  if (!serverA || !serverB) notFound()

  const a = serverA as Server
  const b = serverB as Server

  const toolsA = a.tools?.length || 0
  const toolsB = b.tools?.length || 0

  // Determine winner for verdict
  const winner = a.score_total > b.score_total ? a : b
  const loser = a.score_total > b.score_total ? b : a
  const scoreDiff = Math.abs(a.score_total - b.score_total)
  const isTie = scoreDiff < 5

  // Find related comparisons from pairs data
  const allPairs = loadComparisonPairs()
  const relatedPairs = allPairs
    .filter(p =>
      (p.slugA === slugA || p.slugB === slugA || p.slugA === slugB || p.slugB === slugB) &&
      !(p.slugA === slugA && p.slugB === slugB) &&
      !(p.slugA === slugB && p.slugB === slugA)
    )
    .slice(0, 6)

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${a.name} vs ${b.name} — MCP Server Comparison`,
    description: `Side-by-side comparison of ${a.name} and ${b.name} MCP servers.`,
    url: `https://mcppedia.org/compare/${slugs}`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mcppedia.org' },
        { '@type': 'ListItem', position: 2, name: 'Servers', item: 'https://mcppedia.org/servers' },
        { '@type': 'ListItem', position: 3, name: `${a.name} vs ${b.name}` },
      ],
    },
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="text-sm text-text-muted mb-6">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-accent">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/servers" className="hover:text-accent">Servers</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-text-primary">{a.name} vs {b.name}</li>
        </ol>
      </nav>

      <h1 className="text-2xl font-semibold text-text-primary mb-2 text-center">
        {a.name} vs {b.name}
      </h1>
      <p className="text-text-muted text-center mb-8">Side-by-side MCP server comparison</p>

      {/* Score cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <Link href={`/s/${a.slug}`} className="text-lg font-semibold text-accent hover:text-accent-hover block mb-3">
            {a.name}
          </Link>
          <ScoreCard server={a} />
        </div>
        <div>
          <Link href={`/s/${b.slug}`} className="text-lg font-semibold text-accent hover:text-accent-hover block mb-3">
            {b.name}
          </Link>
          <ScoreCard server={b} />
        </div>
      </div>

      {/* Comparison table */}
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-bg-secondary border-b border-border">
              <th className="px-3 py-2 text-sm font-medium text-text-primary text-right w-1/3">{a.name}</th>
              <th className="px-3 py-2 text-sm font-medium text-text-muted text-center w-1/3">Metric</th>
              <th className="px-3 py-2 text-sm font-medium text-text-primary text-left w-1/3">{b.name}</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow label="MCPpedia Score" valA={a.score_total} valB={b.score_total} />
            <CompareRow label="Security Score" valA={a.score_security} valB={b.score_security} />
            <CompareRow label="Maintenance Score" valA={a.score_maintenance} valB={b.score_maintenance} />
            <CompareRow label="GitHub Stars" valA={a.github_stars} valB={b.github_stars} />
            <CompareRow label="Weekly Downloads" valA={a.npm_weekly_downloads} valB={b.npm_weekly_downloads} />
            <CompareRow label="Tools" valA={toolsA} valB={toolsB} />
            <CompareRow label="Est. Token Cost" valA={toolsA * 150} valB={toolsB * 150} higherIsBetter={false} />
            <CompareRow label="Open CVEs" valA={a.cve_count} valB={b.cve_count} higherIsBetter={false} />
            <tr className="border-b border-border">
              <td className="px-3 py-2 text-sm text-right">
                <HealthBadge status={a.health_status as HealthStatus} />
              </td>
              <td className="px-3 py-2 text-sm text-center text-text-muted">Health</td>
              <td className="px-3 py-2 text-sm">
                <HealthBadge status={b.health_status as HealthStatus} />
              </td>
            </tr>
            <CompareRow
              label="Auth Required"
              valA={a.has_authentication ? 'Yes' : 'No'}
              valB={b.has_authentication ? 'Yes' : 'No'}
            />
            <CompareRow
              label="Transport"
              valA={a.transport?.join(', ') || 'stdio'}
              valB={b.transport?.join(', ') || 'stdio'}
            />
            <CompareRow
              label="License"
              valA={a.license || 'Unknown'}
              valB={b.license || 'Unknown'}
            />
            <CompareRow
              label="API Pricing"
              valA={a.api_pricing || 'unknown'}
              valB={b.api_pricing || 'unknown'}
            />
          </tbody>
        </table>
      </div>

      {/* Verdict */}
      <div className="mt-8 p-5 bg-bg-secondary border border-border rounded-lg">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Verdict</h2>
        {isTie ? (
          <p className="text-sm text-text-muted">
            <strong>{a.name}</strong> and <strong>{b.name}</strong> are closely matched with scores of {a.score_total} and {b.score_total} respectively.
            {a.score_security !== b.score_security && ` ${a.score_security > b.score_security ? a.name : b.name} edges ahead on security.`}
            {' '}Check each server&apos;s detail page to decide which fits your use case.
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            <strong>{winner.name}</strong> leads with a score of {winner.score_total} ({getGrade(winner.score_total)}) vs {loser.name}&apos;s {loser.score_total} ({getGrade(loser.score_total)}).
            {winner.score_security > loser.score_security && ` ${winner.name} also scores higher on security (${winner.score_security} vs ${loser.score_security}).`}
            {loser.github_stars > winner.github_stars && ` However, ${loser.name} has more community traction with ${formatNumber(loser.github_stars)} GitHub stars.`}
          </p>
        )}
      </div>

      {/* Related comparisons */}
      {relatedPairs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Related Comparisons</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedPairs.map(pair => (
              <Link
                key={`${pair.slugA}-vs-${pair.slugB}`}
                href={`/compare/${pair.slugA}-vs-${pair.slugB}`}
                className="block p-3 border border-border rounded-md hover:border-accent transition-colors text-sm"
              >
                <span className="text-text-primary font-medium">{pair.nameA}</span>
                <span className="text-text-muted mx-1.5">vs</span>
                <span className="text-text-primary font-medium">{pair.nameB}</span>
                {pair.category && (
                  <span className="block text-xs text-text-muted mt-1">{pair.category}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Compare CTA + internal links */}
      <div className="mt-8 text-center space-y-3">
        <p className="text-sm text-text-muted">
          Compare any two servers:{' '}
          <code className="bg-code-bg px-1 rounded text-xs">mcppedia.org/compare/server-a-vs-server-b</code>
        </p>
        <div className="flex items-center justify-center gap-4 text-sm">
          <Link href="/servers" className="text-accent hover:text-accent-hover">
            Browse all servers &rarr;
          </Link>
          <Link href={`/s/${a.slug}`} className="text-accent hover:text-accent-hover">
            {a.name} details &rarr;
          </Link>
          <Link href={`/s/${b.slug}`} className="text-accent hover:text-accent-hover">
            {b.name} details &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
