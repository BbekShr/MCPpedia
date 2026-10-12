/**
 * Pure decision logic for bots/cost-anomaly-probe.ts, kept separate so it is
 * unit-testable without the Cloudflare API.
 *
 * Why this exists: in Oct 2026 an ISR regeneration loop grew from ~18k to ~300k
 * Durable Object queue runs and R2 Class A writes per day for two weeks before
 * the bill showed anything — the free allowances absorbed it, so a dollar-based
 * budget alert stayed silent. These checks look at usage, not dollars.
 */

export interface DailyPoint {
  date: string // YYYY-MM-DD (UTC)
  value: number
}

export interface MetricRule {
  name: string
  /** Ignore spikes below this daily volume — noise at tiny scale costs nothing. */
  floor: number
  /** Monthly free allowance. If set, alert when the recent run-rate would exceed it. */
  includedPerMonth?: number
}

/** Alert when the last full day exceeds this multiple of the trailing baseline. */
export const SPIKE_MULTIPLIER = 2
/** Days averaged for the spike baseline. */
export const BASELINE_DAYS = 7
/** Days averaged for the 30-day run-rate projection. Short so a fix clears it within days. */
export const PROJECTION_DAYS = 3

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * `series` must be oldest-first, full UTC days only (exclude today). Returns
 * human-readable problems; empty means healthy.
 */
export function evaluateMetric(series: DailyPoint[], rule: MetricRule): string[] {
  const problems: string[] = []
  if (series.length === 0) return problems
  const last = series[series.length - 1]
  const baselinePoints = series.slice(-1 - BASELINE_DAYS, -1)

  if (last.value >= rule.floor && baselinePoints.length >= 3) {
    const baseline = mean(baselinePoints.map(p => p.value))
    if (last.value > baseline * SPIKE_MULTIPLIER) {
      const x = baseline > 0 ? `${(last.value / baseline).toFixed(1)}x` : 'up from zero vs'
      problems.push(
        `${rule.name}: ${fmt(last.value)} on ${last.date} is ${x} the ${baselinePoints.length}-day average (${fmt(baseline)}/day).`,
      )
    }
  }

  if (rule.includedPerMonth !== undefined) {
    const recent = series.slice(-PROJECTION_DAYS).map(p => p.value)
    const projected = mean(recent) * 30
    if (projected > rule.includedPerMonth) {
      problems.push(
        `${rule.name}: last ${recent.length} days project to ${fmt(projected)}/month, over the ${fmt(rule.includedPerMonth)} free allowance.`,
      )
    }
  }
  return problems
}

/**
 * ISR regenerations (DO queue runs) should be a small fraction of requests. More
 * regenerations than requests means a cache is defeating itself — the exact
 * signature of the Oct 2026 regional-cache bug.
 */
export function evaluateRegenerationRatio(
  regenerations: number,
  requests: number,
  floor: number,
): string[] {
  if (regenerations < floor || regenerations <= requests) return []
  return [
    `ISR regenerations (${fmt(regenerations)}) exceeded Worker requests (${fmt(requests)}) on the last full day — pages are being regenerated more often than they are visited.`,
  ]
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
