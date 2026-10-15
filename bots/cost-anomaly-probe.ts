/**
 * Cost anomaly probe — alarms on Cloudflare usage, not dollars.
 *
 * Reads the last ~10 full UTC days of account-wide usage from Cloudflare's
 * GraphQL Analytics API and fails if any billable metric spikes or is on pace to
 * blow through its free allowance (rules in bots/lib/cost-anomaly.ts). A
 * non-zero exit turns the run red and alert-on-failure.yml opens a tracking
 * issue — the same path the freshness probe uses.
 *
 * Usage is account-wide (photobari shares the account), matching how Cloudflare
 * bills. Per-script/bucket breakdowns are logged to point at the culprit.
 *
 * Needs CLOUDFLARE_API_TOKEN with "Account Analytics: Read", and CLOUDFLARE_ACCOUNT_ID.
 */
import {
  evaluateMetric,
  evaluateRegenerationRatio,
  type DailyPoint,
  type MetricRule,
} from './lib/cost-anomaly'

const LOOKBACK_DAYS = 10

// https://developers.cloudflare.com/r2/pricing/#class-a-operations
const R2_CLASS_A = new Set([
  'ListBuckets', 'PutBucket', 'ListObjects', 'PutObject', 'CopyObject',
  'CompleteMultipartUpload', 'CreateMultipartUpload', 'LifecycleStorageTierTransition',
  'ListMultipartUploads', 'UploadPart', 'UploadPartCopy', 'ListParts',
  'PutBucketEncryption', 'PutBucketCors', 'PutBucketLifecycleConfiguration',
])

// Floors are daily volumes below which a spike is not worth an issue.
// Allowances are the Workers Paid plan's monthly inclusions.
const RULES = {
  doGbSeconds: { name: 'Durable Objects duration (GB-s)', floor: 5_000, includedPerMonth: 400_000 },
  doRequests: { name: 'Durable Objects requests', floor: 20_000, includedPerMonth: 1_000_000 },
  r2ClassA: { name: 'R2 Class A operations', floor: 20_000, includedPerMonth: 1_000_000 },
  // CPU already runs above its 30M ms allowance at normal traffic, so only spikes alert.
  workersCpuMs: { name: 'Workers CPU (ms)', floor: 5_000_000 },
} satisfies Record<string, MetricRule>

const REGENERATION_RATIO_FLOOR = 5_000

async function gql<T>(query: string): Promise<T> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const body = await res.json() as { data?: T; errors?: { message: string }[] | null }
  // A token without Analytics:Read returns errors, not an empty result. Never
  // treat that as "zero usage" — that is how a broken probe looks healthy.
  if (!res.ok || body.errors?.length || !body.data) {
    throw new Error(`GraphQL ${res.status}: ${JSON.stringify(body.errors ?? body)}`)
  }
  return body.data
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Dense oldest-first series over `days`, filling days with no rows as 0. */
function toSeries(days: string[], totals: Map<string, number>): DailyPoint[] {
  return days.map(date => ({ date, value: totals.get(date) ?? 0 }))
}

function addTo(map: Map<string, number>, key: string, v: number) {
  map.set(key, (map.get(key) ?? 0) + v)
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId || !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set')
  }

  // Full UTC days only: today is partial and would always look like a dip.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const days: string[] = []
  for (let i = LOOKBACK_DAYS; i >= 1; i--) days.push(isoDay(new Date(today.getTime() - i * 86_400_000)))
  const since = days[0]
  const until = isoDay(today)

  type Row<D, S> = { dimensions: D; sum: S }
  const data = await gql<{
    viewer: { accounts: {
      dur: Row<{ date: string }, { activeTime: number }>[]
      doReq: Row<{ date: string }, { requests: number }>[]
      r2: Row<{ date: string; actionType: string; bucketName: string }, { requests: number }>[]
      w: Row<{ date: string; scriptName: string }, { requests: number; cpuTimeUs: number }>[]
    }[] }
  }>(`{
    viewer { accounts(filter: { accountTag: "${accountId}" }) {
      dur: durableObjectsPeriodicGroups(limit: 1000, filter: { date_geq: "${since}", date_lt: "${until}" }) {
        dimensions { date } sum { activeTime }
      }
      doReq: durableObjectsInvocationsAdaptiveGroups(limit: 1000, filter: { date_geq: "${since}", date_lt: "${until}" }) {
        dimensions { date } sum { requests }
      }
      r2: r2OperationsAdaptiveGroups(limit: 5000, filter: { date_geq: "${since}", date_lt: "${until}" }) {
        dimensions { date actionType bucketName } sum { requests }
      }
      w: workersInvocationsAdaptive(limit: 5000, filter: { date_geq: "${since}", date_lt: "${until}" }) {
        dimensions { date scriptName } sum { requests cpuTimeUs }
      }
    } }
  }`)
  const acct = data.viewer.accounts[0]
  if (!acct) throw new Error(`No analytics returned for account ${accountId} — check the token's account scope`)

  const doGbS = new Map<string, number>()
  // activeTime is in microseconds; DO duration bills at a fixed 128 MB.
  for (const r of acct.dur) addTo(doGbS, r.dimensions.date, (r.sum.activeTime / 1e6) * 0.125)
  const doReq = new Map<string, number>()
  for (const r of acct.doReq) addTo(doReq, r.dimensions.date, r.sum.requests)
  const r2A = new Map<string, number>()
  const r2ByBucket = new Map<string, number>()
  const cpuMs = new Map<string, number>()
  const workerReq = new Map<string, number>()
  const lastDay = days[days.length - 1]
  for (const r of acct.r2) {
    if (!R2_CLASS_A.has(r.dimensions.actionType)) continue
    addTo(r2A, r.dimensions.date, r.sum.requests)
    if (r.dimensions.date === lastDay) addTo(r2ByBucket, r.dimensions.bucketName, r.sum.requests)
  }
  const reqByScript = new Map<string, number>()
  for (const r of acct.w) {
    addTo(cpuMs, r.dimensions.date, r.sum.cpuTimeUs / 1000)
    addTo(workerReq, r.dimensions.date, r.sum.requests)
    if (r.dimensions.date === lastDay) addTo(reqByScript, r.dimensions.scriptName, r.sum.requests)
  }

  const series = {
    doGbSeconds: toSeries(days, doGbS),
    doRequests: toSeries(days, doReq),
    r2ClassA: toSeries(days, r2A),
    workersCpuMs: toSeries(days, cpuMs),
  }
  for (const [key, s] of Object.entries(series)) {
    console.log(`${RULES[key as keyof typeof RULES].name}: ${s.map(p => `${p.date.slice(5)}=${Math.round(p.value)}`).join(' ')}`)
  }
  console.log(`Last day (${lastDay}) R2 Class A by bucket: ${JSON.stringify(Object.fromEntries(r2ByBucket))}`)
  console.log(`Last day (${lastDay}) Worker requests by script: ${JSON.stringify(Object.fromEntries(reqByScript))}`)

  const problems = [
    ...(Object.keys(series) as (keyof typeof series)[]).flatMap(k => evaluateMetric(series[k], RULES[k])),
    // The only DO namespace is OpenNext's revalidation queue, so DO requests ≈ ISR regenerations.
    ...evaluateRegenerationRatio(doReq.get(lastDay) ?? 0, workerReq.get(lastDay) ?? 0, REGENERATION_RATIO_FLOOR),
  ]

  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`)
    console.error('cost-anomaly-probe: usage anomaly detected — see docs/org-memory/codebase.md "withRegionalCache was removed" for the last incident.')
    process.exit(1)
  }
  console.log('cost-anomaly-probe: OK — no usage spikes, all metrics within their free-allowance pace.')
}

main().catch(err => {
  console.error(`cost-anomaly-probe: unexpected error: ${String(err)}`)
  process.exit(1)
})
