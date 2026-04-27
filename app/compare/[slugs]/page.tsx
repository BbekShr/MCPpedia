import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import ScoreCard from '@/components/ScoreCard'
import HealthBadge from '@/components/HealthBadge'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import type { HealthStatus } from '@/lib/constants'
import { PUBLIC_SERVER_FIELDS, SITE_URL } from '@/lib/constants'
import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'

export const revalidate = 604800 // 7d; on-demand revalidate triggers on edits and score deltas

const MIN_SERVERS = 2
const MAX_SERVERS = 4

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
  // Only pre-render the curated 2-server pairs. N≥3 routes are ISR'd on demand —
  // generating every 3- or 4-tuple of 17k servers would explode.
  const pairs = loadComparisonPairs()
  return pairs.map(p => ({
    slugs: `${p.slugA}-vs-${p.slugB}`,
  }))
}

// ---------- Helpers ----------

function parseSlugs(slugsParam: string): string[] | null {
  const slugs = slugsParam.split('-vs-').filter(Boolean)
  if (slugs.length < MIN_SERVERS || slugs.length > MAX_SERVERS) return null
  // Reject duplicates — comparing X vs X has no value and would skew the table
  if (new Set(slugs).size !== slugs.length) return null
  return slugs
}

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

function bestIndices(values: (string | number)[], higherIsBetter: boolean): Set<number> {
  const numeric = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => typeof x.v === 'number')
  if (numeric.length < 2) return new Set()
  const target = higherIsBetter
    ? Math.max(...numeric.map(x => x.v))
    : Math.min(...numeric.map(x => x.v))
  // Don't highlight if every value is identical — there's no winner.
  if (numeric.every(x => x.v === target)) return new Set()
  return new Set(numeric.filter(x => x.v === target).map(x => x.i))
}

interface CompareRowProps {
  label: string
  values: (string | number)[]
  higherIsBetter?: boolean
}

function CompareRow({ label, values, higherIsBetter = true }: CompareRowProps) {
  const winners = bestIndices(values, higherIsBetter)
  return (
    <tr className="border-b border-border">
      <td className="px-3 py-2 text-sm text-text-muted whitespace-nowrap sticky left-0 bg-bg z-10">
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-3 py-2 text-sm ${winners.has(i) ? 'text-green font-medium' : 'text-text-primary'}`}
        >
          {typeof v === 'number' ? formatNumber(v) : v}
        </td>
      ))}
    </tr>
  )
}

// ---------- Metadata ----------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugs: string }>
}): Promise<Metadata> {
  const { slugs: slugsParam } = await params
  const slugs = parseSlugs(slugsParam)
  if (!slugs) return { title: 'Compare MCP Servers' }

  const supabase = createPublicClient()
  const results = await Promise.all(
    slugs.map(s =>
      supabase.from('servers').select('name, tagline, score_total').eq('slug', s).single()
    )
  )
  const servers = results.map((r, i) => ({
    name: r.data?.name || slugs[i],
    score: r.data?.score_total || 0,
  }))

  const title = `${servers.map(s => s.name).join(' vs ')} — MCP Server Comparison`
  const description = `Compare ${servers
    .map(s => `${s.name} (score: ${s.score})`)
    .join(', ')} side-by-side. See security scores, tools, maintenance, downloads, and compatibility.`

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/compare/${slugsParam}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/compare/${slugsParam}`,
      type: 'website',
    },
  }
}

// ---------- Page ----------

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slugs: string }>
}) {
  const { slugs: slugsParam } = await params
  const slugs = parseSlugs(slugsParam)
  if (!slugs) notFound()

  const supabase = createPublicClient()
  const results = await Promise.all(
    slugs.map(s =>
      supabase.from('servers').select(PUBLIC_SERVER_FIELDS).eq('slug', s).single()
    )
  )
  if (results.some(r => !r.data)) notFound()

  const servers = results.map(r => r.data as Server)
  const n = servers.length

  // Verdict: top scorer wins; tie if top two are within 5 points
  const sortedByScore = [...servers].sort((a, b) => b.score_total - a.score_total)
  const winner = sortedByScore[0]
  const runnerUp = sortedByScore[1]
  const isTie = Math.abs(winner.score_total - runnerUp.score_total) < 5

  // Find related comparisons. For N=2 use the curated pairs JSON; for N≥3
  // suggest sub-pairs (e.g. a-vs-b-vs-c → a-vs-b, b-vs-c, a-vs-c) so users can
  // drill into 1v1 matchups.
  const allPairs = loadComparisonPairs()
  let relatedPairs: ComparisonPair[]
  if (n === 2) {
    const [slugA, slugB] = slugs
    relatedPairs = allPairs
      .filter(p =>
        (p.slugA === slugA || p.slugB === slugA || p.slugA === slugB || p.slugB === slugB) &&
        !(p.slugA === slugA && p.slugB === slugB) &&
        !(p.slugA === slugB && p.slugB === slugA)
      )
      .slice(0, 6)
  } else {
    relatedPairs = []
    for (let i = 0; i < servers.length; i++) {
      for (let j = i + 1; j < servers.length; j++) {
        relatedPairs.push({
          slugA: servers[i].slug,
          slugB: servers[j].slug,
          nameA: servers[i].name,
          nameB: servers[j].name,
        })
      }
    }
  }

  const namesJoined = servers.map(s => s.name).join(' vs ')

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${namesJoined} — MCP Server Comparison`,
    description: `Side-by-side comparison of ${namesJoined} MCP servers.`,
    url: `${SITE_URL}/compare/${slugsParam}`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Servers', item: `${SITE_URL}/servers` },
        { '@type': 'ListItem', position: 3, name: namesJoined },
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
        <ol className="flex items-center gap-1.5 flex-wrap">
          <li><Link href="/" className="hover:text-accent">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/servers" className="hover:text-accent">Servers</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-text-primary">{namesJoined}</li>
        </ol>
      </nav>

      <h1 className="text-2xl font-semibold text-text-primary mb-2 text-center">
        {namesJoined}
      </h1>
      <p className="text-text-muted text-center mb-8">Side-by-side MCP server comparison</p>

      {/* Score cards: 2-col grid for N=2 (preserves SEO-indexed layout), horizontal scroll for N≥3 */}
      {n === 2 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {servers.map(s => (
            <div key={s.id}>
              <Link href={`/s/${s.slug}`} className="text-lg font-semibold text-accent hover:text-accent-hover block mb-3">
                {s.name}
              </Link>
              <ScoreCard server={s} />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 mb-8">
          <div className="flex gap-4 pb-2">
            {servers.map(s => (
              <div key={s.id} className="min-w-[280px] flex-1">
                <Link href={`/s/${s.slug}`} className="text-lg font-semibold text-accent hover:text-accent-hover block mb-3">
                  {s.name}
                </Link>
                <ScoreCard server={s} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison table */}
      <div className="border border-border rounded-md overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-bg-secondary border-b border-border">
              <th className="px-3 py-2 text-sm font-medium text-text-muted text-left whitespace-nowrap sticky left-0 bg-bg-secondary z-10">
                Metric
              </th>
              {servers.map(s => (
                <th
                  key={s.id}
                  className="px-3 py-2 text-sm font-medium text-text-primary text-left"
                >
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompareRow label="MCPpedia Score" values={servers.map(s => s.score_total)} />
            <CompareRow label="Security Score" values={servers.map(s => s.score_security)} />
            <CompareRow label="Maintenance Score" values={servers.map(s => s.score_maintenance)} />
            <CompareRow label="GitHub Stars" values={servers.map(s => s.github_stars)} />
            <CompareRow label="Weekly Downloads" values={servers.map(s => s.npm_weekly_downloads)} />
            <CompareRow label="Tools" values={servers.map(s => s.tools?.length || 0)} />
            <CompareRow
              label="Est. Token Cost"
              values={servers.map(s => (s.tools?.length || 0) * 150)}
              higherIsBetter={false}
            />
            <CompareRow label="Open CVEs" values={servers.map(s => s.cve_count)} higherIsBetter={false} />
            <tr className="border-b border-border">
              <td className="px-3 py-2 text-sm text-text-muted whitespace-nowrap sticky left-0 bg-bg z-10">
                Health
              </td>
              {servers.map(s => (
                <td key={s.id} className="px-3 py-2 text-sm">
                  <HealthBadge status={s.health_status as HealthStatus} />
                </td>
              ))}
            </tr>
            <CompareRow
              label="Auth Required"
              values={servers.map(s => (s.has_authentication ? 'Yes' : 'No'))}
            />
            <CompareRow
              label="Transport"
              values={servers.map(s => s.transport?.join(', ') || 'stdio')}
            />
            <CompareRow
              label="License"
              values={servers.map(s => s.license || 'Unknown')}
            />
            <CompareRow
              label="API Pricing"
              values={servers.map(s => s.api_pricing || 'unknown')}
            />
          </tbody>
        </table>
      </div>

      {/* Verdict */}
      <div className="mt-8 p-5 bg-bg-secondary border border-border rounded-lg">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Verdict</h2>
        {isTie ? (
          <p className="text-sm text-text-muted">
            <strong>{winner.name}</strong> and <strong>{runnerUp.name}</strong> are closely matched at the top with scores of {winner.score_total} and {runnerUp.score_total}.
            {winner.score_security !== runnerUp.score_security && ` ${winner.score_security > runnerUp.score_security ? winner.name : runnerUp.name} edges ahead on security.`}
            {' '}Check each server&apos;s detail page to decide which fits your use case.
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            <strong>{winner.name}</strong> leads with a score of {winner.score_total} ({getGrade(winner.score_total)}), ahead of {runnerUp.name}&apos;s {runnerUp.score_total} ({getGrade(runnerUp.score_total)}).
            {winner.score_security > runnerUp.score_security && ` ${winner.name} also scores higher on security (${winner.score_security} vs ${runnerUp.score_security}).`}
            {runnerUp.github_stars > winner.github_stars && ` However, ${runnerUp.name} has more community traction with ${formatNumber(runnerUp.github_stars)} GitHub stars.`}
          </p>
        )}
      </div>

      {/* Related comparisons */}
      {relatedPairs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            {n === 2 ? 'Related Comparisons' : 'Drill into 1-vs-1'}
          </h2>
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
          Compare up to {MAX_SERVERS} servers:{' '}
          <code className="bg-code-bg px-1 rounded text-xs">mcppedia.org/compare/server-a-vs-server-b-vs-server-c</code>
        </p>
        <div className="flex items-center justify-center gap-x-4 gap-y-2 text-sm flex-wrap">
          <Link href="/servers" className="text-accent hover:text-accent-hover">
            Browse all servers &rarr;
          </Link>
          {servers.map(s => (
            <Link key={s.id} href={`/s/${s.slug}`} className="text-accent hover:text-accent-hover">
              {s.name} details &rarr;
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
