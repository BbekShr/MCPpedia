import { unstable_cache } from 'next/cache'
import { createPublicClient } from './supabase/public'

// Data-derived intro copy for the hub pages (/best, /best/*, /best-for/*,
// /category/*, /compare/*).
//
// Those ~900 pages took ZERO impressions in 90 days. They were a heading, a
// hand-written sentence, and a list of cards — nothing on them that a search
// engine could rank and nothing an answer engine could quote. The fix is not
// more boilerplate: it is a paragraph made of numbers only we have, regenerated
// from the live catalog on every revalidation, so the page says something true
// today that no other page on the internet says.
//
// Everything here degrades to null rather than throwing. A hub page that loses
// its intro is worse than one that has it; a hub page that 500s is worse still.

export interface HubAggregates {
  total: number
  scored50: number
  scored70: number
  official: number
  withCves: number
}

export interface HubLeader {
  name: string
  slug: string
  score: number
}

// Five head-only counts. Measured against production: ~1s for all five in
// parallel on the largest category (developer-tools, 4,521 rows). `total` is
// estimated because an exact count on a 6k-row category exceeds anon's 3s
// statement timeout — the same reason /category/[category] uses one — while the
// filtered counts are small enough to run exact and ride the score index.
async function fetchAggregates(categories: string[]): Promise<HubAggregates | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
  const supabase = createPublicClient()
  const base = () =>
    supabase
      .from('servers')
      .select('id', { count: 'exact', head: true })
      .overlaps('categories', categories)
      .eq('is_archived', false)

  try {
    const [total, scored50, scored70, official, withCves] = await Promise.all([
      supabase
        .from('servers')
        .select('id', { count: 'estimated', head: true })
        .overlaps('categories', categories)
        .eq('is_archived', false),
      base().gte('score_total', 50),
      base().gte('score_total', 70),
      base().eq('author_type', 'official'),
      base().gt('cve_count', 0),
    ])
    if (total.error || scored50.error || scored70.error) return null
    return {
      total: total.count ?? 0,
      scored50: scored50.count ?? 0,
      scored70: scored70.count ?? 0,
      official: official.count ?? 0,
      withCves: withCves.count ?? 0,
    }
  } catch (error) {
    console.error('[hub-intro] aggregate fetch failed', error)
    return null
  }
}

// Cached for a day, keyed on the category set. Hub pages are prerendered and
// revalidated weekly, so this is five queries per category per day at worst —
// but the cache is what stops a crawler sweeping 22 categories from running 110
// live counts.
export const getHubAggregates = unstable_cache(
  (categories: string[]) => fetchAggregates(categories),
  ['hub-aggregates-v1'],
  { revalidate: 86400, tags: ['hub-aggregates'] },
)

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

// The 0-100 score's five inputs, spelled out. This is the one part of the intro
// that is the same everywhere, and it earns its place: it is the sentence that
// tells a reader (and an answer engine) what our ranking actually means, which
// is the whole claim these hub pages make.
const SCORE_EXPLAINER =
  'Every score is the same five weighted inputs: security (CVE scanning, tool-poisoning ' +
  'detection, and whether the server authenticates at all), maintenance (commit recency, ' +
  'release cadence, and download trend), documentation, client compatibility, and token ' +
  'efficiency — how much of your context window the tool definitions consume before you ' +
  'have asked anything.'

/**
 * 150-300 words of intro copy for a hub page, built from live aggregates.
 * Returns an empty array when there is no data worth describing, so callers can
 * simply skip the block.
 */
export function buildHubIntro({
  subject,
  agg,
  leaders,
}: {
  // The thing being listed, as it reads mid-sentence: "database MCP servers".
  subject: string
  agg: HubAggregates | null
  leaders: HubLeader[]
}): string[] {
  if (!agg || agg.total <= 0) return []

  const paragraphs: string[] = []
  const thin = Math.max(agg.total - agg.scored50, 0)

  paragraphs.push(
    `MCPpedia tracks ${agg.total.toLocaleString()} ${subject}. ` +
      `${agg.scored50.toLocaleString()} of them score at least 50 out of 100, and ` +
      `${agg.scored70.toLocaleString()} clear 70 — about ${pct(agg.scored70, agg.total)}% of what has been ` +
      `published in this space. The remaining ${thin.toLocaleString()} are thinner: registry entries ` +
      `with no description, no published tool schema, or no commit in the last year. They are all still ` +
      `listed here, because knowing a server exists and is unmaintained is worth as much as knowing ` +
      `a good one exists.`,
  )

  const top = leaders[0]
  if (top) {
    const runnersUp = leaders.slice(1, 3)
    const runnerText = runnersUp.length
      ? ` ${runnersUp.map(l => `${l.name} (${l.score})`).join(' and ')} follow${runnersUp.length === 1 ? 's' : ''}.`
      : ''
    paragraphs.push(
      `${top.name} leads the list at ${top.score}/100.${runnerText} ${SCORE_EXPLAINER}`,
    )
  } else {
    paragraphs.push(SCORE_EXPLAINER)
  }

  const provenance =
    agg.official > 0
      ? `${agg.official.toLocaleString()} of these servers are published by the vendor behind the ` +
        `underlying API rather than by a third party, which is usually the difference between an ` +
        `integration that tracks upstream changes and one that quietly stops working.`
      : `None of these servers are vendor-published yet — they are all community builds, so upstream ` +
        `API changes are the thing to watch.`

  const security =
    agg.withCves > 0
      ? ` ${agg.withCves.toLocaleString()} currently carry an open CVE; those are flagged on the ` +
        `server's own page with the advisory and its severity.`
      : ` None currently carry an open CVE, though that is a snapshot — advisories are re-scanned daily.`

  paragraphs.push(provenance + security)

  return paragraphs
}

/**
 * Intro copy for /servers, the whole-catalog listing.
 *
 * Separate from `buildHubIntro` because it takes NO aggregates: that helper's
 * scored50/scored70 counts are `count: 'exact'`, which is only affordable
 * because a single category is small. Across the whole ~36k-row table it is the
 * query shape that blew anon's 3s statement timeout in S20/S28. Everything here
 * comes from the home_stats snapshot and the first page of results, both of
 * which /servers has already fetched — so the prose costs no extra round trip.
 *
 * Returns [] when there is no catalog total worth quoting, so the caller can
 * skip the block rather than print a sentence with a hole in it.
 */
export function buildCatalogIntro({
  total,
  leader,
}: {
  total: number
  leader?: { name: string; score: number } | null
}): string[] {
  if (total <= 0) return []

  const paragraphs = [
    `MCPpedia tracks ${total.toLocaleString()} Model Context Protocol servers and rescores ` +
      `every one of them daily. The catalog is the whole ecosystem, not a curated shortlist: official ` +
      `vendor servers, community projects, and the long tail of registry entries that were published ` +
      `once and never touched again. Knowing that a server exists and is unmaintained is worth as much ` +
      `as knowing a good one exists, so both are listed and both are scored.`,
  ]

  paragraphs.push(
    leader?.score
      ? `${leader.name} currently leads at ${leader.score}/100. ${SCORE_EXPLAINER}`
      : SCORE_EXPLAINER,
  )

  return paragraphs
}

/**
 * A verdict paragraph for /compare — answer-first, because that is the shape an
 * answer engine extracts. Says which one to pick and why in the first sentence.
 */
export function buildCompareVerdict(
  a: { name: string; score: number; toolCount: number; cveCount: number; official: boolean; stars: number },
  b: { name: string; score: number; toolCount: number; cveCount: number; official: boolean; stars: number },
): string {
  const [winner, loser] = a.score >= b.score ? [a, b] : [b, a]
  const margin = Math.abs(a.score - b.score)

  if (margin < 5) {
    const tiebreak =
      winner.toolCount !== loser.toolCount
        ? `${winner.name} exposes ${winner.toolCount} tools against ${loser.name}'s ${loser.toolCount}, so the choice comes down to whether you need that extra surface area or would rather keep your context window small`
        : `they are close enough on every measure that the deciding factor is which upstream service you already use`
    return (
      `Short answer: it is close. ${a.name} scores ${a.score}/100 and ${b.name} scores ${b.score}/100 — ` +
      `a ${margin}-point gap, which is inside the noise of a weekly rescore. ${tiebreak}.`
    )
  }

  const reasons: string[] = []
  if (winner.cveCount === 0 && loser.cveCount > 0) {
    reasons.push(`it has no open CVEs while ${loser.name} has ${loser.cveCount}`)
  }
  if (winner.official && !loser.official) {
    reasons.push('it is published by the vendor behind the API rather than by a third party')
  }
  if (winner.toolCount > loser.toolCount) {
    reasons.push(`it exposes ${winner.toolCount} tools to ${loser.name}'s ${loser.toolCount}`)
  }
  if (winner.stars > loser.stars * 2 && winner.stars > 0) {
    reasons.push(`it has ${winner.stars.toLocaleString()} GitHub stars against ${loser.stars.toLocaleString()}`)
  }
  if (!reasons.length) {
    reasons.push('it scores higher across the weighted security, maintenance and documentation inputs')
  }

  return (
    `Short answer: pick ${winner.name}. It scores ${winner.score}/100 to ${loser.name}'s ${loser.score}/100, ` +
    `and ${joinClauses(reasons)}. ${loser.name} is still worth a look if you are already invested in it — ` +
    `the full breakdown below shows exactly where the ${margin} points go.`
  )
}

function joinClauses(items: string[]): string {
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
