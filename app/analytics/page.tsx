import { createPublicClient } from '@/lib/supabase/public'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRetry } from '@/lib/retry'
import { CATEGORY_LABELS, HEALTH_STATUSES, CLIENT_LABELS } from '@/lib/constants'
import type { Category, CompatibleClient } from '@/lib/constants'
import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 86400 // 24 hours

export const metadata: Metadata = {
  title: 'MCP Ecosystem Analytics',
  description: 'Stats on the MCP server ecosystem — scores, categories, health, security, and more. Updated daily.',
}

type Counts = Record<string, number>

/**
 * One row of `daily_metrics` — the nightly ecosystem snapshot written by
 * bots/snapshot-metrics.ts (5:30 UTC, after compute-scores). Every aggregate
 * this page shows is read from here.
 */
type Snapshot = {
  snapshot_date: string
  total_servers: number
  avg_score_total: number
  avg_score_security: number
  avg_score_maintenance: number
  avg_score_documentation: number
  avg_score_compatibility: number
  avg_score_efficiency: number
  total_github_stars: number
  total_npm_weekly_downloads: number
  total_tools: number
  servers_with_cves: number
  servers_with_auth: number
  open_cves: number
  score_buckets: { label: string; count: number }[] | null
  categories: Counts | null
  health_status: Counts | null
  author_type: Counts | null
  api_pricing: Counts | null
  transport: Counts | null
  compatible_clients: Counts | null
  token_efficiency_grades: Counts | null
}

const SNAPSHOT_FIELDS = [
  'snapshot_date',
  'total_servers',
  'avg_score_total',
  'avg_score_security',
  'avg_score_maintenance',
  'avg_score_documentation',
  'avg_score_compatibility',
  'avg_score_efficiency',
  'total_github_stars',
  'total_npm_weekly_downloads',
  'total_tools',
  'servers_with_cves',
  'servers_with_auth',
  'open_cves',
  'score_buckets',
  'categories',
  'health_status',
  'author_type',
  'api_pricing',
  'transport',
  'compatible_clients',
  'token_efficiency_grades',
].join(', ')

const asCounts = (v: Counts | null | undefined): Counts => v ?? {}

const EMPTY_BUCKETS = Array.from({ length: 10 }, (_, i) => ({
  label: `${i * 10}-${i === 9 ? 100 : i * 10 + 9}`,
  count: 0,
}))

/** "2026-07-24" → "Jul 24, 2026". Dates are stored as plain UTC dates. */
function formatSnapshotDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
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
  // Use the service-role client, NOT the anon `createPublicClient()`: the
  // anon/authenticated roles carry a short per-statement timeout (see
  // 20260718120000_home_stats_refresh_timeout.sql) and the concurrent
  // build-time prerender workers were tripping it. service_role has no
  // statement timeout. It's the plain supabase-js client (no next/headers
  // cookies), so the page stays statically generated / ISR-cacheable for SEO,
  // exactly like createPublicClient(). Server component only — the service key
  // never reaches the client. Falls back to the anon client when the service
  // key is absent (local dev without secrets → mock client → empty render).
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient('analytics')
    : createPublicClient()

  // Every ecosystem aggregate below is read from the nightly `daily_metrics`
  // snapshot (bots/snapshot-metrics.ts). This page used to recompute all of
  // them live by walking the ENTIRE servers table — ~40 sequential 1000-row
  // keyset pages — which pushed /analytics past Next's 60s per-route build
  // budget and made production deploys depend on build retries (S50). The
  // snapshot computes the same aggregates the same way over the same
  // `is_archived = false` row set, so no number changes meaning; only its
  // as-of time moves from "build time" to "last nightly snapshot", which the
  // header now states explicitly.
  const now = new Date()

  const [historyRows, mcpUsage, months] = await Promise.all([
    // Last 90 snapshots. Order descending + limit takes the 90 MOST RECENT
    // rows (ascending+limit would return the oldest 90); reversed below to
    // ascending for left-to-right chart rendering and deltas.
    withRetry(async () => {
      const { data, error } = await supabase
        .from('daily_metrics')
        .select(SNAPSHOT_FIELDS)
        .order('snapshot_date', { ascending: false })
        .limit(90)
      if (error) throw new Error(`analytics: daily_metrics fetch failed: ${error.message}`)
      return ((data || []) as unknown as Snapshot[]).slice().reverse()
    }).catch((): Snapshot[] => []),

    // MCP API usage (last 90 days)
    withRetry(async () => {
      const { data, error } = await supabase
        .from('mcp_api_usage')
        .select('usage_date, action, count')
        .order('usage_date', { ascending: true })
        .limit(600) // ~90 days * 6 actions
      if (error) throw new Error(`analytics: mcp_api_usage fetch failed: ${error.message}`)
      return (data || []) as Array<{ usage_date: string; action: string; count: number }>
    }).catch((): Array<{ usage_date: string; action: string; count: number }> => []),

    // The 12-month "servers added" histogram is the ONE aggregate
    // daily_metrics cannot supply: it stores only `servers_added_today`, and
    // its history starts 2026-04-08 (20260408000000_daily_metrics.sql) — well
    // short of 12 months. Rather than re-walk every row for `created_at`, ask
    // Postgres for 12 head-only exact counts in parallel: each is a range seek
    // on `servers_created_idx` (20260402000000_initial_schema.sql:87) and
    // transfers no rows at all.
    withRetry(async () => {
      const windows = Array.from({ length: 12 }, (_, i) => {
        const from = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
        const to = new Date(now.getFullYear(), now.getMonth() - (10 - i), 1)
        return { from, to, label: from.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) }
      })
      const results = await Promise.all(windows.map(w =>
        supabase
          .from('servers')
          .select('id', { count: 'exact', head: true })
          .eq('is_archived', false)
          .gte('created_at', w.from.toISOString())
          .lt('created_at', w.to.toISOString())
      ))
      // A month whose count errored would render as a zero bar — "no servers
      // were added that month", a wrong fact rather than a missing one. Fail
      // the batch so the whole chart degrades to an explicit notice instead.
      const failed = results.find(r => r.error)
      if (failed) throw new Error(`analytics: monthly additions count failed: ${failed.error!.message}`)
      return windows.map((w, i) => ({ label: w.label, count: results[i].count ?? 0 }))
    }).catch((): { label: string; count: number }[] | null => null),
  ])

  // Pick the newest snapshot we are willing to render. Two failure modes are
  // deliberately treated differently:
  //   - transient FETCH failure (query errored after retries, or last night's
  //     bot run never wrote a row): fall back to the newest row we DO have and
  //     say "as of <date>" in the header. Degrade, don't throw — throwing here
  //     fails the production build, which is exactly what S50 was about.
  //   - genuine DATA truncation (a snapshot whose total_servers collapsed by
  //     >50% versus the readings right before it — e.g. the bot ran against a
  //     partial table): refuse that row, same as the old >50% guard did, and
  //     keep walking back. We never render numbers we believe to be wrong.
  let latestSnapshot: Snapshot | null = null
  for (let i = historyRows.length - 1; i >= 0; i--) {
    const priorBest = historyRows
      .slice(Math.max(0, i - 7), i)
      .reduce((m, r) => Math.max(m, r.total_servers || 0), 0)
    if (priorBest > 100 && (historyRows[i].total_servers || 0) < priorBest * 0.5) continue
    latestSnapshot = historyRows[i]
    break
  }

  const total = latestSnapshot?.total_servers ?? 0

  if (!latestSnapshot || total === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Analytics</h1>
        <p className="text-text-muted">No server data available yet.</p>
      </div>
    )
  }

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

  // --- Read aggregates off the snapshot ---

  const avgScore = latestSnapshot.avg_score_total || 0
  const avgSecurity = latestSnapshot.avg_score_security || 0
  const avgMaintenance = latestSnapshot.avg_score_maintenance || 0
  const avgDocs = latestSnapshot.avg_score_documentation || 0
  const avgCompat = latestSnapshot.avg_score_compatibility || 0
  const avgEfficiency = latestSnapshot.avg_score_efficiency || 0

  // Score distribution (buckets of 10)
  const rawBuckets = latestSnapshot.score_buckets ?? []
  const scoreBuckets = rawBuckets.length > 0 ? rawBuckets : EMPTY_BUCKETS

  // Categories
  const catEntries = Object.entries(asCounts(latestSnapshot.categories)).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...catEntries.map(e => e[1]), 1)

  // Health status
  const healthCounts = asCounts(latestSnapshot.health_status)

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
  const authorCounts = { official: 0, community: 0, unknown: 0, ...asCounts(latestSnapshot.author_type) }
  const authorEntries = [
    { label: 'Official', value: authorCounts.official, color: 'var(--accent)' },
    { label: 'Community', value: authorCounts.community, color: 'var(--cat-maintenance)' },
    { label: 'Unknown', value: authorCounts.unknown, color: 'color-mix(in srgb, var(--text-muted) 30%, transparent)' },
  ].filter(e => e.value > 0)

  // API pricing
  const pricingCounts = { free: 0, freemium: 0, paid: 0, unknown: 0, ...asCounts(latestSnapshot.api_pricing) }
  const pricingEntries = [
    { label: 'Free', value: pricingCounts.free, color: 'var(--green)' },
    { label: 'Freemium', value: pricingCounts.freemium, color: 'var(--accent)' },
    { label: 'Paid', value: pricingCounts.paid, color: 'var(--yellow)' },
    { label: 'Unknown', value: pricingCounts.unknown, color: 'color-mix(in srgb, var(--text-muted) 30%, transparent)' },
  ].filter(e => e.value > 0)

  // Transport
  const transportCounts = asCounts(latestSnapshot.transport)
  const transportPalette = ['var(--accent)', 'var(--cat-maintenance)', 'var(--cat-efficiency)', 'var(--cat-documentation)', 'var(--yellow)']
  const transportEntries = Object.entries(transportCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, count], i) => ({
      label: t.toUpperCase(),
      value: count,
      color: transportPalette[i % transportPalette.length],
    }))

  // Compatible clients
  const clientEntries = Object.entries(asCounts(latestSnapshot.compatible_clients)).sort((a, b) => b[1] - a[1])
  const maxClient = Math.max(...clientEntries.map(e => e[1]), 1)

  // Token efficiency grades
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0, unknown: 0, ...asCounts(latestSnapshot.token_efficiency_grades) }
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
  const withCVEs = latestSnapshot.servers_with_cves ?? 0
  const withAuth = latestSnapshot.servers_with_auth ?? 0
  // MEANING CHANGE: this used to be SUM(servers.cve_count) — the per-server CVE
  // counter the scoring engine writes. It is now `daily_metrics.open_cves`, a
  // direct count of `security_advisories` rows with status = 'open'. That is
  // the same number the "Open CVEs" trend card on this page already plots, so
  // the two now agree instead of contradicting each other by construction.
  const openCVEs = latestSnapshot.open_cves ?? 0

  // Stars & downloads
  const totalStars = latestSnapshot.total_github_stars ?? 0
  const totalDownloads = latestSnapshot.total_npm_weekly_downloads ?? 0
  const totalTools = latestSnapshot.total_tools ?? 0

  // Score breakdown — uses category-specific palette colors from globals.css
  const scoreCategories = [
    { label: 'Security', value: avgSecurity, max: 30, color: 'var(--cat-security)' },
    { label: 'Maintenance', value: avgMaintenance, max: 25, color: 'var(--cat-maintenance)' },
    { label: 'Efficiency', value: avgEfficiency, max: 20, color: 'var(--cat-efficiency)' },
    { label: 'Documentation', value: avgDocs, max: 15, color: 'var(--cat-documentation)' },
    { label: 'Compatibility', value: avgCompat, max: 10, color: 'var(--cat-compatibility)' },
  ]

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">MCP Ecosystem Analytics</h1>
        <p className="text-text-muted text-sm">
          Ecosystem stats across {total.toLocaleString()} servers, as of{' '}
          {formatSnapshotDate(latestSnapshot.snapshot_date)}. Refreshed daily.
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
          {months
            ? <MonthlyBarChart months={months} />
            : <p className="text-sm text-text-muted py-8 text-center">Monthly breakdown temporarily unavailable.</p>}
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
          Ecosystem aggregates come from the nightly snapshot taken at 5:30 UTC
          ({formatSnapshotDate(latestSnapshot.snapshot_date)}).
        </p>
      </div>
    </div>
  )
}
