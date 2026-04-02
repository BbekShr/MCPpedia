import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScoreCard from '@/components/ScoreCard'
import HealthBadge from '@/components/HealthBadge'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import type { HealthStatus } from '@/lib/constants'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugs: string }>
}): Promise<Metadata> {
  const { slugs } = await params
  const [a, b] = slugs.split('-vs-')
  if (!a || !b) return { title: 'Compare MCP Servers' }
  return {
    title: `${a} vs ${b} — MCP Server Comparison`,
    description: `Compare ${a} and ${b} MCP servers side-by-side. See scores, tools, security, and compatibility.`,
  }
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
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

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slugs: string }>
}) {
  const { slugs } = await params
  const parts = slugs.split('-vs-')

  if (parts.length !== 2) notFound()

  const [slugA, slugB] = parts
  const supabase = await createClient()

  const [{ data: serverA }, { data: serverB }] = await Promise.all([
    supabase.from('servers').select('*').eq('slug', slugA).single(),
    supabase.from('servers').select('*').eq('slug', slugB).single(),
  ])

  if (!serverA || !serverB) notFound()

  const a = serverA as Server
  const b = serverB as Server

  const toolsA = a.tools?.length || 0
  const toolsB = b.tools?.length || 0

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
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
      <div className="mt-6 text-center text-sm text-text-muted">
        <p>
          Compare any two servers:{' '}
          <code className="bg-code-bg px-1 rounded text-xs">mcppedia.org/compare/server-a-vs-server-b</code>
        </p>
      </div>
    </div>
  )
}
