/**
 * Normalizes /servers listing search params into a finite cache-key space.
 *
 * `app/servers/page.tsx` caches its listing round-trip with `unstable_cache`,
 * which keys on the stringified argument object. The page reads NINE params,
 * five of them free-form, so keying on the raw values would let a crawler mint
 * an unbounded number of cache entries and defeat the cache entirely — in
 * exactly the scenario the cache exists for. Everything a request can vary is
 * collapsed here into a bounded, allow-listed shape first.
 *
 * NOTE: `app/category/[category]/page.tsx` still keys on raw values and should
 * adopt this later — deliberately not changed here.
 */
import {
  CATEGORIES,
  TRANSPORTS,
  HEALTH_STATUSES,
  API_PRICING_OPTIONS,
  AUTHOR_TYPES,
} from '@/lib/constants'

export type ServersListingParams = {
  mode: 'search' | 'catalog'
  q: string
  category: string
  status: string
  pricing: string
  author: string
  transport: string
  sort: string
  minScore: number
  offset: number
}

/**
 * `empty` means "this request provably matches zero rows" — an out-of-range
 * filter value. The caller must render the empty state WITHOUT a DB round trip
 * and without writing a cache entry.
 */
export type NormalizedServersQuery =
  | { kind: 'empty' }
  | { kind: 'query'; params: ServersListingParams }

export const CATALOG_SORTS = ['stars', 'downloads', 'commit', 'newest', 'name'] as const
export const SEARCH_SORTS = ['relevance', 'stars', 'newest', 'name', 'downloads'] as const

export const MAX_SCORE = 100

// Plain-array `includes`, never a Record lookup: an object-literal map keyed by
// untrusted input returns inherited members (`MAP['constructor']` is truthy) —
// the prototype trap recorded under S58.
function member(value: string, allowed: readonly string[]): boolean {
  return allowed.includes(value)
}

/** '' (absent) passes through; a member returns itself; anything else is `null` = provably empty. */
function filter(raw: string | undefined, allowed: readonly string[]): string | null {
  const value = raw || ''
  if (value === '') return ''
  return member(value, allowed) ? value : null
}

export function normalizeServersQuery(
  raw: Record<string, string | undefined>,
  offset: number,
): NormalizedServersQuery {
  // Verbatim, no trim: `?q=%20%20` is truthy today and selects the search
  // branch. Trimming would flip it to the catalog branch — a behavior change.
  const q = raw.q || ''
  const mode: ServersListingParams['mode'] = q ? 'search' : 'catalog'

  // A bogus filter value is NOT equivalent to an absent one: `?status=zzz` runs
  // `.eq('health_status','zzz')` and matches zero rows, while `?status=`
  // returns the whole catalog. Collapsing it to '' would silently turn a
  // typo into "show everything", so short-circuit instead.
  const category = filter(raw.category, CATEGORIES)
  const status = filter(raw.status, HEALTH_STATUSES)
  const pricing = filter(raw.pricing, API_PRICING_OPTIONS)
  const author = filter(raw.author, AUTHOR_TYPES)
  const transport = filter(raw.transport, TRANSPORTS)
  if (
    category === null ||
    status === null ||
    pricing === null ||
    author === null ||
    transport === null
  ) {
    return { kind: 'empty' }
  }

  const parsed = parseInt(raw.min_score || '0', 10)
  const minScore = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
  // `SCORE_WEIGHTS` sums to 100 (lib/scoring.ts:12-18), so `score_total` can
  // never exceed 100 — a `min_score` above it is provably empty.
  if (minScore > MAX_SCORE) return { kind: 'empty' }

  // Sort normalization is branch-aware because the two branches recognize
  // DIFFERENT arms. The catalog switch (app/servers/page.tsx) falls through to
  // score-descending, so any unrecognized value is identical to ''. The RPC's
  // order-by has arms relevance|stars|newest|name|downloads and NO `commit`
  // arm (20260719120000_search_servers_filters.sql:38-44); an unrecognized
  // `sort_by` there falls through to the trailing `s.github_stars desc nulls
  // last`, i.e. exactly 'stars'.
  const rawSort = raw.sort || ''
  const sort =
    mode === 'catalog'
      ? member(rawSort, CATALOG_SORTS)
        ? rawSort
        : ''
      : rawSort === ''
        ? 'relevance'
        : member(rawSort, SEARCH_SORTS)
          ? rawSort
          : 'stars'

  return {
    kind: 'query',
    params: { mode, q, category, status, pricing, author, transport, sort, minScore, offset },
  }
}
