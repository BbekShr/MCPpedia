import { createPublicClient } from '@/lib/supabase/public'
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

function compactNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

// Generate "nice" Y-axis tick values for a range, e.g. [0, 250, 500, 750, 1000].
function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1]
  const rough = max / target
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return ticks
}

// Bar with optional percent label. Used in the long category list.
function HBar({ label, count, max, total, color = 'var(--accent)' }: {
  label: string
  count: number
  max: number
  total?: number
  color?: string
}) {
  const width = max === 0 ? 0 : Math.max(2, Math.round((count / max) * 100))
  const percent = total ? Math.round((count / total) * 100) : null
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 text-text-muted truncate">{label}</span>
      <div className="flex-1 h-5 bg-bg-secondary rounded overflow-hidden relative">
        <div
          className="h-full rounded transition-[width] duration-500"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <span className="w-20 text-right text-text-muted tabular-nums text-xs">
        <span className="text-text-primary font-medium">{count.toLocaleString()}</span>
        {percent !== null && <span className="ml-1 opacity-60">{percent}%</span>}
      </span>
    </div>
  )
}

function StatBox({ label, value, sub, delta, prevValue }: {
  label: string
  value: string | number
  sub?: string
  delta?: number
  prevValue?: number
}) {
  const deltaPct = delta !== undefined && prevValue !== undefined && prevValue !== 0
    ? (delta / prevValue) * 100
    : undefined
  const showDelta = delta !== undefined && delta !== 0
  return (
    <div className="border border-border rounded-lg p-4 bg-bg hover:shadow-sm transition-shadow">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-semibold text-text-primary tabular-nums">{value}</p>
      {showDelta && (
        <p className={`text-xs mt-1 font-medium ${delta > 0 ? 'text-green' : 'text-red'} flex items-center gap-1`}>
          <span>{delta > 0 ? '▲' : '▼'}</span>
          <span>{Math.abs(delta).toLocaleString()}</span>
          {deltaPct !== undefined && Math.abs(deltaPct) >= 0.05 && (
            <span className="opacity-70">({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>
          )}
          <span className="text-text-muted font-normal">vs 7d ago</span>
        </p>
      )}
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

// Area-filled SVG sparkline with start/end markers.
let sparkUid = 0
function Sparkline({ data, color = 'var(--accent)', height = 44 }: {
  data: number[]
  color?: string
  height?: number
}) {
  if (data.length < 2) return null
  const w = 200
  const h = height
  const pad = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return [x, y] as const
  })
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`
  const last = pts[pts.length - 1]
  const gradId = `spark-grad-${++sparkUid}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        stroke={color}
        strokeWidth="1.75"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="2.75" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.18" />
    </svg>
  )
}

function TrendCard({ label, data, color, format = (n) => n.toLocaleString() }: {
  label: string
  data: number[]
  color: string
  format?: (n: number) => string
}) {
  if (data.length === 0) {
    return (
      <div className="border border-border rounded-lg p-4">
        <p className="text-xs text-text-muted mb-2">{label}</p>
        <p className="text-sm text-text-muted">No data</p>
      </div>
    )
  }
  const last = data[data.length - 1]
  const first = data[0]
  const change = first === 0 ? 0 : ((last - first) / first) * 100
  const showChange = data.length >= 2 && Math.abs(change) >= 0.05
  return (
    <div className="border border-border rounded-lg p-4 bg-bg">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs text-text-muted">{label}</p>
        {showChange && (
          <p className={`text-[11px] font-medium ${change > 0 ? 'text-green' : 'text-red'}`}>
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </p>
        )}
      </div>
      <p className="text-lg font-semibold text-text-primary tabular-nums mb-2">{format(last)}</p>
      <Sparkline data={data} color={color} />
    </div>
  )
}

// Vertical histogram with Y-axis grid + value labels above bars.
function Histogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  const w = 560
  const h = 220
  const padL = 36
  const padR = 12
  const padT = 14
  const padB = 28
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const max = Math.max(...buckets.map(b => b.count), 1)
  const ticks = niceTicks(max, 4)
  const tickMax = ticks[ticks.length - 1]
  const cellW = innerW / buckets.length
  const barW = cellW * 0.74
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Score distribution histogram">
      {ticks.map((t, i) => {
        const y = padT + innerH - (t / tickMax) * innerH
        return (
          <g key={i}>
            <line
              x1={padL}
              y1={y}
              x2={w - padR}
              y2={y}
              stroke="var(--border)"
              strokeDasharray={i === 0 ? undefined : '2 4'}
              opacity={i === 0 ? 0.7 : 0.45}
            />
            <text x={padL - 6} y={y + 3.5} fontSize="10" fill="var(--text-muted)" textAnchor="end">
              {compactNum(t)}
            </text>
          </g>
        )
      })}
      {buckets.map((b, i) => {
        const x = padL + i * cellW + (cellW - barW) / 2
        const bh = (b.count / tickMax) * innerH
        const y = padT + innerH - bh
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} fill="var(--accent)" rx="3" />
            {b.count > 0 && (
              <text
                x={x + barW / 2}
                y={Math.max(padT + 10, y - 4)}
                fontSize="10"
                fill="var(--text)"
                textAnchor="middle"
                fontWeight="500"
              >
                {b.count.toLocaleString()}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={h - 10}
              fontSize="10"
              fill="var(--text-muted)"
              textAnchor="middle"
            >
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Daily bar chart for short time series (e.g. last 28 days). Y-axis grid,
// weekly date labels, peak highlight, native SVG tooltips.
function DailyBarChart({ days }: { days: Array<[string, number]> }) {
  const w = 720
  const h = 220
  const padL = 40
  const padR = 12
  const padT = 14
  const padB = 28
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const max = Math.max(...days.map(d => d[1]), 1)
  const peakIdx = days.findIndex(d => d[1] === max)
  const ticks = niceTicks(max, 4)
  const tickMax = ticks[ticks.length - 1]
  const cellW = innerW / days.length
  const barW = Math.max(2, cellW * 0.72)
  // ~6 evenly-spaced labels, always include first + last
  const labelStep = Math.max(1, Math.floor(days.length / 5))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Daily API calls">
      {ticks.map((t, i) => {
        const y = padT + innerH - (t / tickMax) * innerH
        return (
          <g key={i}>
            <line
              x1={padL}
              y1={y}
              x2={w - padR}
              y2={y}
              stroke="var(--border)"
              strokeDasharray={i === 0 ? undefined : '2 4'}
              opacity={i === 0 ? 0.7 : 0.45}
            />
            <text x={padL - 6} y={y + 3.5} fontSize="10" fill="var(--text-muted)" textAnchor="end">
              {compactNum(t)}
            </text>
          </g>
        )
      })}
      {days.map(([date, count], i) => {
        const cx = padL + i * cellW + cellW / 2
        const x = cx - barW / 2
        const bh = (count / tickMax) * innerH
        const y = padT + innerH - bh
        const isPeak = i === peakIdx
        const isLast = i === days.length - 1
        const isFirst = i === 0
        const farEnoughFromEnd = days.length - 1 - i >= Math.floor(labelStep / 2)
        const farEnoughFromStart = i >= Math.floor(labelStep / 2)
        const showLabel = isFirst || isLast || (i % labelStep === 0 && farEnoughFromStart && farEnoughFromEnd)
        return (
          <g key={date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(0, bh)}
              fill={isPeak ? 'var(--accent-hover)' : 'var(--accent)'}
              opacity={isPeak ? 1 : 0.88}
              rx="1.5"
            >
              <title>{date}: {count.toLocaleString()}</title>
            </rect>
            {showLabel && (
              <text
                x={cx}
                y={h - 10}
                fontSize="10"
                fill="var(--text-muted)"
                textAnchor="middle"
              >
                {date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Monthly bar chart with Y-axis grid + tilted month labels.
function MonthlyBarChart({ months }: { months: { label: string; count: number }[] }) {
  const w = 600
  const h = 220
  const padL = 38
  const padR = 12
  const padT = 14
  const padB = 38
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const max = Math.max(...months.map(m => m.count), 1)
  const ticks = niceTicks(max, 4)
  const tickMax = ticks[ticks.length - 1]
  const cellW = innerW / months.length
  const barW = cellW * 0.6
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Monthly server additions">
      {ticks.map((t, i) => {
        const y = padT + innerH - (t / tickMax) * innerH
        return (
          <g key={i}>
            <line
              x1={padL}
              y1={y}
              x2={w - padR}
              y2={y}
              stroke="var(--border)"
              strokeDasharray={i === 0 ? undefined : '2 4'}
              opacity={i === 0 ? 0.7 : 0.45}
            />
            <text x={padL - 6} y={y + 3.5} fontSize="10" fill="var(--text-muted)" textAnchor="end">
              {compactNum(t)}
            </text>
          </g>
        )
      })}
      {months.map((m, i) => {
        const cx = padL + i * cellW + cellW / 2
        const x = cx - barW / 2
        const bh = (m.count / tickMax) * innerH
        const y = padT + innerH - bh
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} fill="var(--accent)" rx="2" />
            {m.count > 0 && bh > 8 && (
              <text x={cx} y={Math.max(padT + 10, y - 4)} fontSize="9" fill="var(--text)" textAnchor="middle" fontWeight="500">
                {compactNum(m.count)}
              </text>
            )}
            <text
              x={cx}
              y={h - padB + 14}
              fontSize="10"
              fill="var(--text-muted)"
              textAnchor="end"
              transform={`rotate(-35 ${cx} ${h - padB + 14})`}
            >
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Donut with center total + legend below.
function Donut({ entries, size = 150, thickness = 22, centerLabel = 'total' }: {
  entries: Array<{ label: string; value: number; color: string }>
  size?: number
  thickness?: number
  centerLabel?: string
}) {
  const total = entries.reduce((s, e) => s + e.value, 0)
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth={thickness} />
      {total > 0 && entries.map((e, i) => {
        const len = (e.value / total) * c
        if (len <= 0) return null
        const seg = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={e.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        )
        offset += len
        return seg
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--text)">
        {compactNum(total)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
        {centerLabel}
      </text>
    </svg>
  )
}

function DonutCard({ title, entries, footnote, centerLabel }: {
  title: string
  entries: Array<{ label: string; value: number; color: string }>
  footnote?: React.ReactNode
  centerLabel?: string
}) {
  const total = entries.reduce((s, e) => s + e.value, 0) || 1
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  return (
    <section className="border border-border rounded-lg p-5 bg-bg">
      <h2 className="text-sm font-semibold text-text-primary mb-4">{title}</h2>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="shrink-0">
          <Donut entries={entries} centerLabel={centerLabel} />
        </div>
        <ul className="flex-1 space-y-1.5 w-full">
          {sorted.map(e => (
            <li key={e.label} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: e.color }}
                aria-hidden
              />
              <span className="text-text-muted truncate flex-1">{e.label}</span>
              <span className="text-text-primary tabular-nums font-medium">{e.value.toLocaleString()}</span>
              <span className="text-text-muted tabular-nums text-xs w-9 text-right">
                {Math.round((e.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      {footnote && <p className="text-xs text-text-muted mt-4">{footnote}</p>}
    </section>
  )
}

export default async function AnalyticsPage() {
  const supabase = createPublicClient()

  // Fetch all non-archived servers in pages of 1000 (Supabase default limit).
  // Keyset (cursor) pagination on the indexed `id` primary key, NOT offset-based
  // `.range()` — at 19k+ rows, OFFSET forces Postgres to scan and discard every
  // prior row on each page, and blew the statement timeout once offset hit ~19000.
  // `.gt('id', cursor)` is an index seek regardless of table size.
  const fields = 'id,categories,health_status,author_type,api_pricing,transport,compatible_clients,score_total,score_security,score_maintenance,score_documentation,score_compatibility,score_efficiency,token_efficiency_grade,github_stars,npm_weekly_downloads,cve_count,has_authentication,tools,created_at'
  const pageSize = 1000
  let servers: Record<string, unknown>[] = []
  let cursor: string | null = null
  while (true) {
    let query = supabase
      .from('servers')
      .select(fields)
      .eq('is_archived', false)
      .order('id', { ascending: true })
      .limit(pageSize)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    // Fail loud on a fetch error instead of silently rendering a partial set.
    // A transient error on any page would otherwise `break` and cache a
    // truncated dataset for `revalidate` seconds — every aggregate below
    // (counts, stars, downloads, deltas) computed off the fetched slice.
    // Throwing here makes Next keep serving the last good page and retry.
    if (error) {
      throw new Error(`analytics: failed to fetch servers after cursor ${cursor}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    servers = servers.concat(data)
    if (data.length < pageSize) break
    cursor = data[data.length - 1].id as string
  }

  // Fetch MCP API usage (last 90 days)
  const { data: rawMcpUsage } = await supabase
    .from('mcp_api_usage')
    .select('usage_date, action, count')
    .order('usage_date', { ascending: true })
    .limit(600) // ~90 days * 6 actions
  const mcpUsage = (rawMcpUsage || []) as Array<{ usage_date: string; action: string; count: number }>

  // Fetch historical snapshots (last 90 days). Order descending + limit so we
  // take the 90 MOST RECENT rows (ascending+limit would return the oldest 90),
  // then reverse to ascending for left-to-right chart rendering and deltas.
  const { data: history } = await supabase
    .from('daily_metrics')
    .select('snapshot_date, total_servers, avg_score_total, total_github_stars, total_npm_weekly_downloads, total_tools, servers_with_cves, open_cves, servers_with_auth')
    .order('snapshot_date', { ascending: false })
    .limit(90)

  const historyRows = ((history || []) as Array<{
    snapshot_date: string; total_servers: number; avg_score_total: number;
    total_github_stars: number; total_npm_weekly_downloads: number; total_tools: number;
    servers_with_cves: number; open_cves: number; servers_with_auth: number;
  }>).slice().reverse()

  // Find the row from ~7 days ago for delta calculations
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() - 7)
  const targetStr = targetDate.toISOString().slice(0, 10)
  const prev = historyRows.length > 0
    ? historyRows.reduce((closest, row) =>
        Math.abs(new Date(row.snapshot_date).getTime() - targetDate.getTime()) <
        Math.abs(new Date(closest.snapshot_date).getTime() - targetDate.getTime())
          ? row : closest
      )
    : null
  // Only use prev if it's actually from a different day (not today's row)
  const hasPrev = prev && prev.snapshot_date <= targetStr

  const all = (servers as Pick<Server, 'categories' | 'health_status' | 'author_type' | 'api_pricing' | 'transport' | 'compatible_clients' | 'score_total' | 'score_security' | 'score_maintenance' | 'score_documentation' | 'score_compatibility' | 'score_efficiency' | 'token_efficiency_grade' | 'github_stars' | 'npm_weekly_downloads' | 'cve_count' | 'has_authentication' | 'tools' | 'created_at'>[]) || []
  const total = all.length

  // Sanity guard: if we fetched far fewer servers than the most recent daily
  // snapshot recorded, the paginated fetch almost certainly returned a partial
  // set (see the throw in the fetch loop above). Refuse to render — throwing
  // keeps Next serving the last good page rather than caching bad numbers for
  // `revalidate` seconds. A legitimate day-over-day drop of >50% is not real.
  const latestSnapshot = historyRows.length > 0 ? historyRows[historyRows.length - 1] : null
  if (latestSnapshot && latestSnapshot.total_servers > 100 && total < latestSnapshot.total_servers * 0.5) {
    throw new Error(
      `analytics: fetched ${total} servers but the latest daily snapshot recorded ` +
      `${latestSnapshot.total_servers} — refusing to render a likely-truncated dataset`
    )
  }

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

  const healthColors: Record<string, string> = {
    active: 'var(--green)',
    maintained: 'color-mix(in srgb, var(--green) 60%, transparent)',
    stale: 'var(--yellow)',
    abandoned: 'color-mix(in srgb, var(--red) 60%, transparent)',
    archived: 'var(--red)',
    unknown: 'color-mix(in srgb, var(--text-muted) 30%, transparent)',
  }
  const healthLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const healthEntries = HEALTH_STATUSES
    .filter(s => (healthCounts[s] || 0) > 0)
    .map(s => ({ label: healthLabel(s), value: healthCounts[s], color: healthColors[s] || 'var(--accent)' }))

  // Author type
  const authorCounts: Record<string, number> = { official: 0, community: 0, unknown: 0 }
  for (const s of all) authorCounts[s.author_type] = (authorCounts[s.author_type] || 0) + 1
  const authorEntries = [
    { label: 'Official', value: authorCounts.official, color: 'var(--accent)' },
    { label: 'Community', value: authorCounts.community, color: 'var(--cat-maintenance)' },
    { label: 'Unknown', value: authorCounts.unknown, color: 'color-mix(in srgb, var(--text-muted) 30%, transparent)' },
  ].filter(e => e.value > 0)

  // API pricing
  const pricingCounts: Record<string, number> = { free: 0, freemium: 0, paid: 0, unknown: 0 }
  for (const s of all) pricingCounts[s.api_pricing] = (pricingCounts[s.api_pricing] || 0) + 1
  const pricingEntries = [
    { label: 'Free', value: pricingCounts.free, color: 'var(--green)' },
    { label: 'Freemium', value: pricingCounts.freemium, color: 'var(--accent)' },
    { label: 'Paid', value: pricingCounts.paid, color: 'var(--yellow)' },
    { label: 'Unknown', value: pricingCounts.unknown, color: 'color-mix(in srgb, var(--text-muted) 30%, transparent)' },
  ].filter(e => e.value > 0)

  // Transport
  const transportCounts: Record<string, number> = {}
  for (const s of all) {
    for (const t of s.transport || []) {
      transportCounts[t] = (transportCounts[t] || 0) + 1
    }
  }
  const transportPalette = ['var(--accent)', 'var(--cat-maintenance)', 'var(--cat-efficiency)', 'var(--cat-documentation)', 'var(--yellow)']
  const transportEntries = Object.entries(transportCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, count], i) => ({
      label: t.toUpperCase(),
      value: count,
      color: transportPalette[i % transportPalette.length],
    }))

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
    A: 'var(--green)',
    B: 'color-mix(in srgb, var(--green) 60%, transparent)',
    C: 'var(--yellow)',
    D: 'color-mix(in srgb, var(--red) 60%, transparent)',
    F: 'var(--red)',
    unknown: 'color-mix(in srgb, var(--text-muted) 30%, transparent)',
  }
  const gradeEntries = (['A', 'B', 'C', 'D', 'F', 'unknown'] as const)
    .filter(g => gradeCounts[g] > 0)
    .map(g => ({
      label: g === 'unknown' ? 'Unknown' : `Grade ${g}`,
      value: gradeCounts[g],
      color: gradeColors[g],
    }))

  // Security stats
  const withCVEs = all.filter(s => (s.cve_count || 0) > 0).length
  const withAuth = all.filter(s => s.has_authentication).length
  const openCVEs = all.reduce((s, x) => s + (x.cve_count || 0), 0)

  // Stars & downloads
  const totalStars = all.reduce((s, x) => s + (x.github_stars || 0), 0)
  const totalDownloads = all.reduce((s, x) => s + (x.npm_weekly_downloads || 0), 0)
  const totalTools = all.reduce((s, x) => s + (x.tools?.length || 0), 0)

  // Score breakdown — uses category-specific palette colors from globals.css
  const scoreCategories = [
    { label: 'Security', value: avgSecurity, max: 30, color: 'var(--cat-security)' },
    { label: 'Maintenance', value: avgMaintenance, max: 25, color: 'var(--cat-maintenance)' },
    { label: 'Efficiency', value: avgEfficiency, max: 20, color: 'var(--cat-efficiency)' },
    { label: 'Documentation', value: avgDocs, max: 15, color: 'var(--cat-documentation)' },
    { label: 'Compatibility', value: avgCompat, max: 10, color: 'var(--cat-compatibility)' },
  ]

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

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">MCP Ecosystem Analytics</h1>
        <p className="text-text-muted text-sm">
          Live stats across {total.toLocaleString()} servers. Data refreshed daily.
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatBox
          label="Total Servers"
          value={total.toLocaleString()}
          delta={hasPrev ? total - prev!.total_servers : undefined}
          prevValue={hasPrev ? prev!.total_servers : undefined}
        />
        <StatBox
          label="Avg MCPpedia Score"
          value={`${avgScore}/100`}
          delta={hasPrev ? avgScore - prev!.avg_score_total : undefined}
          prevValue={hasPrev ? prev!.avg_score_total : undefined}
        />
        <StatBox
          label="Total GitHub Stars"
          value={totalStars.toLocaleString()}
          delta={hasPrev ? totalStars - prev!.total_github_stars : undefined}
          prevValue={hasPrev ? prev!.total_github_stars : undefined}
        />
        <StatBox
          label="Weekly npm Downloads"
          value={totalDownloads.toLocaleString()}
          delta={hasPrev ? totalDownloads - prev!.total_npm_weekly_downloads : undefined}
          prevValue={hasPrev ? prev!.total_npm_weekly_downloads : undefined}
        />
        <StatBox
          label="Total Tools Exposed"
          value={totalTools.toLocaleString()}
          delta={hasPrev ? totalTools - prev!.total_tools : undefined}
          prevValue={hasPrev ? prev!.total_tools : undefined}
        />
        <StatBox
          label="Servers with CVEs"
          value={withCVEs.toLocaleString()}
          sub={`${openCVEs.toLocaleString()} open CVEs`}
          delta={hasPrev ? withCVEs - prev!.servers_with_cves : undefined}
          prevValue={hasPrev ? prev!.servers_with_cves : undefined}
        />
        <StatBox label="With Authentication" value={`${pct(withAuth, total)}%`} sub={`${withAuth.toLocaleString()} of ${total.toLocaleString()}`} />
        <StatBox label="Official Servers" value={authorCounts.official.toLocaleString()} sub={`${pct(authorCounts.official, total)}% of total`} />
      </div>

      {/* Trend sparklines */}
      {historyRows.length >= 7 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Trends ({historyRows.length} days)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TrendCard label="Total Servers" data={historyRows.map(h => h.total_servers)} color="var(--accent)" />
            <TrendCard label="Avg Score" data={historyRows.map(h => h.avg_score_total)} color="var(--green)" />
            <TrendCard label="GitHub Stars" data={historyRows.map(h => h.total_github_stars)} color="var(--yellow)" format={compactNum} />
            <TrendCard label="Open CVEs" data={historyRows.map(h => h.open_cves)} color="var(--red)" />
          </div>
        </section>
      )}

      {/* Average scores breakdown */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Average Score Breakdown</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {scoreCategories.map(s => (
            <div key={s.label} className="border border-border rounded-lg p-4 bg-bg">
              <p className="text-xs text-text-muted mb-2">{s.label}</p>
              <p className="text-xl font-semibold text-text-primary tabular-nums">
                {s.value}
                <span className="text-sm text-text-muted font-normal">/{s.max}</span>
              </p>
              <div className="mt-2 h-2 bg-bg-secondary rounded overflow-hidden">
                <div
                  className="h-full rounded transition-[width] duration-500"
                  style={{ width: `${Math.round((s.value / s.max) * 100)}%`, background: s.color }}
                />
              </div>
              <p className="text-[11px] text-text-muted mt-1.5 tabular-nums">
                {Math.round((s.value / s.max) * 100)}% of max
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* Score distribution */}
        <section className="border border-border rounded-lg p-5 bg-bg">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Score Distribution</h2>
          <p className="text-xs text-text-muted mb-3">Servers per 10-point bucket</p>
          <Histogram buckets={scoreBuckets} />
        </section>

        {/* Growth over time */}
        <section className="border border-border rounded-lg p-5 bg-bg">
          <h2 className="text-sm font-semibold text-text-primary mb-1">Servers Added (Last 12 Months)</h2>
          <p className="text-xs text-text-muted mb-3">New servers indexed by month</p>
          <MonthlyBarChart months={months} />
        </section>
      </div>

      {/* Categories — full-width with 2-col layout to halve scroll length */}
      <section className="mb-10 border border-border rounded-lg p-5 bg-bg">
        <h2 className="text-sm font-semibold text-text-primary mb-1">By Category</h2>
        <p className="text-xs text-text-muted mb-4">{catEntries.length} categories · servers can belong to multiple</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
          {catEntries.map(([cat, count]) => (
            <HBar
              key={cat}
              label={CATEGORY_LABELS[cat as Category] || cat}
              count={count}
              max={maxCat}
              total={total}
            />
          ))}
        </div>
      </section>

      {/* Compositional breakdowns — donut + legend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <DonutCard
          title="Health Status"
          entries={healthEntries}
          centerLabel="servers"
          footnote="Active = commit in last 30 days. Stale = no commit in 90+ days."
        />
        <DonutCard
          title="Transport Protocols"
          entries={transportEntries}
          centerLabel="declared"
          footnote="Servers may declare more than one transport."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <DonutCard
          title="Token Efficiency Grades"
          entries={gradeEntries}
          centerLabel="servers"
          footnote={
            <>
              Grade A = under 500 tokens per call.{' '}
              <Link href="/methodology" className="text-accent hover:text-accent-hover">See methodology</Link>
            </>
          }
        />
        <section className="border border-border rounded-lg p-5 bg-bg">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Client Compatibility</h2>
          <div className="space-y-2">
            {clientEntries.map(([c, count]) => (
              <HBar
                key={c}
                label={CLIENT_LABELS[c as CompatibleClient] || c}
                count={count}
                max={maxClient}
                total={total}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <DonutCard title="Author Type" entries={authorEntries} centerLabel="servers" />
        <DonutCard title="API Pricing" entries={pricingEntries} centerLabel="servers" />
      </div>

      {/* MCP Server API Usage */}
      {mcpUsage.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-text-primary mb-4">MCP Server API Usage</h2>
          {(() => {
            const todayStr = new Date().toISOString().slice(0, 10)
            const todayRows = mcpUsage.filter(r => r.usage_date === todayStr)
            const todayTotal = todayRows.reduce((s, r) => s + r.count, 0)
            const allTimeTotal = mcpUsage.reduce((s, r) => s + r.count, 0)
            const actionTotals: Record<string, number> = {}
            for (const r of mcpUsage) actionTotals[r.action] = (actionTotals[r.action] || 0) + r.count
            const topActions = Object.entries(actionTotals).sort((a, b) => b[1] - a[1])
            const dailyTotals: Record<string, number> = {}
            for (const r of mcpUsage) dailyTotals[r.usage_date] = (dailyTotals[r.usage_date] || 0) + r.count
            const days = Object.entries(dailyTotals).sort((a, b) => a[0].localeCompare(b[0]))
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                  <StatBox label="Today" value={todayTotal.toLocaleString()} />
                  <StatBox label="All Time" value={allTimeTotal.toLocaleString()} />
                  {topActions.slice(0, 4).map(([action, count]) => (
                    <StatBox key={action} label={action} value={count.toLocaleString()} />
                  ))}
                </div>
                {days.length >= 2 && (() => {
                  const last = days[days.length - 1]
                  const peak = days.reduce((a, b) => (b[1] > a[1] ? b : a))
                  const recent = days.slice(-Math.min(7, days.length))
                  const avg = Math.round(recent.reduce((s, d) => s + d[1], 0) / recent.length)
                  return (
                    <div className="border border-border rounded-lg p-5 bg-bg">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 mb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-text-primary">Daily API calls</h3>
                          <p className="text-xs text-text-muted mt-0.5 tabular-nums">
                            {days[0][0]} → {days[days.length - 1][0]} · {days.length} days
                          </p>
                        </div>
                        <div className="flex gap-6">
                          <div>
                            <p className="text-[11px] text-text-muted uppercase tracking-wide">Today</p>
                            <p className="text-base font-semibold text-text-primary tabular-nums">{last[1].toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-text-muted uppercase tracking-wide">{recent.length}-day avg</p>
                            <p className="text-base font-semibold text-text-primary tabular-nums">{avg.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-text-muted uppercase tracking-wide">Peak</p>
                            <p className="text-base font-semibold text-text-primary tabular-nums">{peak[1].toLocaleString()}</p>
                            <p className="text-[10px] text-text-muted tabular-nums">{peak[0]}</p>
                          </div>
                        </div>
                      </div>
                      <DailyBarChart days={days} />
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </section>
      )}

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
