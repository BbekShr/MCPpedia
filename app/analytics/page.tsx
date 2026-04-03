import { createClient } from '@/lib/supabase/server'
import { CATEGORY_LABELS, HEALTH_STATUSES, CLIENT_LABELS } from '@/lib/constants'
import type { Server } from '@/lib/types'
import type { Category, CompatibleClient } from '@/lib/constants'
import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 86400 // 24 hours

export const metadata: Metadata = {
  title: 'MCP Ecosystem Analytics',
  description: 'Live stats on the MCP server ecosystem — scores, categories, health, security, and more. Updated daily.',
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function Bar({ value, max, label, count, color = 'bg-accent' }: {
  value: number
  max: number
  label: string
  count: number
  color?: string
}) {
  const width = max === 0 ? 0 : Math.max(2, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 text-text-muted truncate">{label}</span>
      <div className="flex-1 h-6 bg-bg-secondary rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 text-right text-text-muted tabular-nums">{count}</span>
    </div>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-semibold text-text-primary tabular-nums">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

export default async function AnalyticsPage() {
  const supabase = await createClient()

  // Fetch all non-archived servers in pages of 1000 (Supabase default limit)
  const fields = 'categories,health_status,author_type,api_pricing,transport,compatible_clients,score_total,score_security,score_maintenance,score_documentation,score_compatibility,score_efficiency,token_efficiency_grade,github_stars,npm_weekly_downloads,cve_count,has_authentication,tools,created_at'
  const pageSize = 1000
  let servers: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('servers')
      .select(fields)
      .eq('is_archived', false)
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    servers = servers.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const all = (servers as Pick<Server, 'categories' | 'health_status' | 'author_type' | 'api_pricing' | 'transport' | 'compatible_clients' | 'score_total' | 'score_security' | 'score_maintenance' | 'score_documentation' | 'score_compatibility' | 'score_efficiency' | 'token_efficiency_grade' | 'github_stars' | 'npm_weekly_downloads' | 'cve_count' | 'has_authentication' | 'tools' | 'created_at'>[]) || []
  const total = all.length

  if (total === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Analytics</h1>
        <p className="text-text-muted">No server data available yet.</p>
      </div>
    )
  }

  // --- Compute aggregates ---

  // Scores
  const avgScore = Math.round(all.reduce((s, x) => s + (x.score_total || 0), 0) / total)
  const avgSecurity = Math.round(all.reduce((s, x) => s + (x.score_security || 0), 0) / total)
  const avgMaintenance = Math.round(all.reduce((s, x) => s + (x.score_maintenance || 0), 0) / total)
  const avgDocs = Math.round(all.reduce((s, x) => s + (x.score_documentation || 0), 0) / total)
  const avgCompat = Math.round(all.reduce((s, x) => s + (x.score_compatibility || 0), 0) / total)
  const avgEfficiency = Math.round(all.reduce((s, x) => s + (x.score_efficiency || 0), 0) / total)

  // Score distribution (buckets of 10)
  const scoreBuckets = Array.from({ length: 10 }, (_, i) => {
    const lo = i * 10
    const hi = lo + 10
    const label = `${lo}-${hi === 100 ? 100 : hi - 1}`
    const count = all.filter(s => {
      const sc = s.score_total || 0
      return hi === 100 ? sc >= lo && sc <= 100 : sc >= lo && sc < hi
    }).length
    return { label, count }
  })
  const maxBucket = Math.max(...scoreBuckets.map(b => b.count), 1)

  // Categories
  const catCounts: Record<string, number> = {}
  for (const s of all) {
    for (const c of s.categories || []) {
      catCounts[c] = (catCounts[c] || 0) + 1
    }
  }
  const catEntries = Object.entries(catCounts).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...catEntries.map(e => e[1]), 1)

  // Health status
  const healthCounts: Record<string, number> = {}
  for (const status of HEALTH_STATUSES) healthCounts[status] = 0
  for (const s of all) healthCounts[s.health_status] = (healthCounts[s.health_status] || 0) + 1
  const healthEntries = Object.entries(healthCounts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const maxHealth = Math.max(...healthEntries.map(e => e[1]), 1)

  const healthColors: Record<string, string> = {
    active: 'bg-green',
    maintained: 'bg-green/60',
    stale: 'bg-yellow',
    abandoned: 'bg-red/60',
    archived: 'bg-red',
    unknown: 'bg-text-muted/30',
  }

  // Author type
  const authorCounts: Record<string, number> = { official: 0, community: 0, unknown: 0 }
  for (const s of all) authorCounts[s.author_type] = (authorCounts[s.author_type] || 0) + 1

  // API pricing
  const pricingCounts: Record<string, number> = { free: 0, freemium: 0, paid: 0, unknown: 0 }
  for (const s of all) pricingCounts[s.api_pricing] = (pricingCounts[s.api_pricing] || 0) + 1

  // Transport
  const transportCounts: Record<string, number> = {}
  for (const s of all) {
    for (const t of s.transport || []) {
      transportCounts[t] = (transportCounts[t] || 0) + 1
    }
  }
  const transportEntries = Object.entries(transportCounts).sort((a, b) => b[1] - a[1])
  const maxTransport = Math.max(...transportEntries.map(e => e[1]), 1)

  // Compatible clients
  const clientCounts: Record<string, number> = {}
  for (const s of all) {
    for (const c of s.compatible_clients || []) {
      clientCounts[c] = (clientCounts[c] || 0) + 1
    }
  }
  const clientEntries = Object.entries(clientCounts).sort((a, b) => b[1] - a[1])
  const maxClient = Math.max(...clientEntries.map(e => e[1]), 1)

  // Token efficiency grades
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0, unknown: 0 }
  for (const s of all) gradeCounts[s.token_efficiency_grade] = (gradeCounts[s.token_efficiency_grade] || 0) + 1
  const gradeColors: Record<string, string> = {
    A: 'bg-green', B: 'bg-green/60', C: 'bg-yellow', D: 'bg-red/60', F: 'bg-red', unknown: 'bg-text-muted/30',
  }

  // Security stats
  const withCVEs = all.filter(s => (s.cve_count || 0) > 0).length
  const withAuth = all.filter(s => s.has_authentication).length
  const openCVEs = all.reduce((s, x) => s + (x.cve_count || 0), 0)

  // Stars & downloads
  const totalStars = all.reduce((s, x) => s + (x.github_stars || 0), 0)
  const totalDownloads = all.reduce((s, x) => s + (x.npm_weekly_downloads || 0), 0)
  const totalTools = all.reduce((s, x) => s + (x.tools?.length || 0), 0)

  // Growth by month (last 12 months)
  const now = new Date()
  const months: { label: string; count: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const count = all.filter(s => {
      const created = new Date(s.created_at)
      return created >= d && created < nextD
    }).length
    months.push({ label, count })
  }
  const maxMonth = Math.max(...months.map(m => m.count), 1)

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">MCP Ecosystem Analytics</h1>
        <p className="text-text-muted text-sm">
          Live stats across {total} servers. Data refreshed daily.
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatBox label="Total Servers" value={total} />
        <StatBox label="Avg MCPpedia Score" value={`${avgScore}/100`} />
        <StatBox label="Total GitHub Stars" value={totalStars.toLocaleString()} />
        <StatBox label="Weekly npm Downloads" value={totalDownloads.toLocaleString()} />
        <StatBox label="Total Tools Exposed" value={totalTools.toLocaleString()} />
        <StatBox label="Servers with CVEs" value={withCVEs} sub={`${openCVEs} open CVEs`} />
        <StatBox label="With Authentication" value={`${pct(withAuth, total)}%`} sub={`${withAuth} of ${total}`} />
        <StatBox label="Official Servers" value={authorCounts.official} sub={`${pct(authorCounts.official, total)}% of total`} />
      </div>

      {/* Average scores breakdown */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Average Score Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Security', value: avgSecurity, max: 30 },
            { label: 'Maintenance', value: avgMaintenance, max: 25 },
            { label: 'Efficiency', value: avgEfficiency, max: 20 },
            { label: 'Documentation', value: avgDocs, max: 15 },
            { label: 'Compatibility', value: avgCompat, max: 10 },
          ].map(s => (
            <div key={s.label} className="border border-border rounded-lg p-4">
              <p className="text-xs text-text-muted mb-2">{s.label}</p>
              <p className="text-xl font-semibold text-text-primary tabular-nums">{s.value}<span className="text-sm text-text-muted font-normal">/{s.max}</span></p>
              <div className="mt-2 h-2 bg-bg-secondary rounded overflow-hidden">
                <div className="h-full bg-accent rounded" style={{ width: `${Math.round((s.value / s.max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
        {/* Score distribution */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Score Distribution</h2>
          <div className="space-y-1.5">
            {scoreBuckets.map(b => (
              <Bar key={b.label} value={b.count} max={maxBucket} label={b.label} count={b.count} />
            ))}
          </div>
        </section>

        {/* Growth over time */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Servers Added (Last 12 Months)</h2>
          <div className="flex items-end gap-1 h-40">
            {months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className="w-full bg-accent rounded-t min-h-[2px]"
                  style={{ height: `${Math.max(2, Math.round((m.count / maxMonth) * 100))}%` }}
                />
                <span className="text-[10px] text-text-muted mt-1 rotate-[-45deg] origin-top-left translate-y-4 whitespace-nowrap">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-1 mt-6">
            {months.map((m, i) => (
              <div key={i} className="flex-1 text-center">
                <span className="text-[10px] text-text-muted tabular-nums">{m.count || ''}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
        {/* Categories */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">By Category</h2>
          <div className="space-y-1.5">
            {catEntries.map(([cat, count]) => (
              <Bar
                key={cat}
                value={count}
                max={maxCat}
                label={CATEGORY_LABELS[cat as Category] || cat}
                count={count}
              />
            ))}
          </div>
        </section>

        {/* Health status */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Health Status</h2>
          <div className="space-y-1.5">
            {healthEntries.map(([status, count]) => (
              <Bar
                key={status}
                value={count}
                max={maxHealth}
                label={status.charAt(0).toUpperCase() + status.slice(1)}
                count={count}
                color={healthColors[status] || 'bg-accent'}
              />
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Active = commit in last 30 days. Stale = no commit in 90+ days.
          </p>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
        {/* Transport */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Transport Protocols</h2>
          <div className="space-y-1.5">
            {transportEntries.map(([t, count]) => (
              <Bar key={t} value={count} max={maxTransport} label={t.toUpperCase()} count={count} />
            ))}
          </div>
        </section>

        {/* Compatible clients */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Client Compatibility</h2>
          <div className="space-y-1.5">
            {clientEntries.map(([c, count]) => (
              <Bar
                key={c}
                value={count}
                max={maxClient}
                label={CLIENT_LABELS[c as CompatibleClient] || c}
                count={count}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
        {/* Token efficiency grades */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Token Efficiency Grades</h2>
          <div className="space-y-1.5">
            {(['A', 'B', 'C', 'D', 'F', 'unknown'] as const).filter(g => gradeCounts[g] > 0).map(g => (
              <Bar
                key={g}
                value={gradeCounts[g]}
                max={Math.max(...Object.values(gradeCounts), 1)}
                label={g === 'unknown' ? 'Unknown' : `Grade ${g}`}
                count={gradeCounts[g]}
                color={gradeColors[g]}
              />
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Grade A = under 500 tokens per call. <Link href="/methodology" className="text-accent hover:text-accent-hover">See methodology</Link>
          </p>
        </section>

        {/* Author type + pricing */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Author Type &amp; Pricing</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border rounded-lg p-4">
              <p className="text-xs text-text-muted mb-3">Author Type</p>
              {Object.entries(authorCounts).filter(([, v]) => v > 0).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm py-1">
                  <span className="text-text-muted capitalize">{type}</span>
                  <span className="text-text-primary tabular-nums font-medium">{count}</span>
                </div>
              ))}
            </div>
            <div className="border border-border rounded-lg p-4">
              <p className="text-xs text-text-muted mb-3">API Pricing</p>
              {Object.entries(pricingCounts).filter(([, v]) => v > 0).map(([pricing, count]) => (
                <div key={pricing} className="flex justify-between text-sm py-1">
                  <span className="text-text-muted capitalize">{pricing}</span>
                  <span className="text-text-primary tabular-nums font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Footer note */}
      <div className="border-t border-border pt-6 text-sm text-text-muted">
        <p>
          Data sourced from the <Link href="/methodology" className="text-accent hover:text-accent-hover">MCPpedia scoring engine</Link>,
          GitHub API, npm registry, and the official MCP registry.
          Refreshed daily at 5:00 UTC.
        </p>
      </div>
    </div>
  )
}
