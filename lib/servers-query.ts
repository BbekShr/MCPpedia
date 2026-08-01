/**
 * Normalizes /servers listing search params into a mostly-finite shape.
 *
 * `app/servers/page.tsx` caches its listing round-trip with `unstable_cache`,
 * which keys on the stringified argument object, so an unvalidated tail would
 * let a crawler mint unbounded cache entries — in exactly the scenario the
 * cache exists for. What this module actually bounds:
 *
 *   - the five filters (`category`/`status`/`pricing`/`author`/`transport`)
 *     collapse to an allow-list member, '' or `kind: 'empty'`;
 *   - `sort` collapses to a member of the branch's own table (`CATALOG_SORTS`
 *     for the catalog, `SEARCH_SORTS` for the RPC) or to that table's real
 *     fallback;
 *   - `minScore` is clamped to 0..`MAX_SCORE`, and `isCacheableQuery` narrows
 *     it further to the four tiers the UI actually emits;
 *   - `offset` is capped by the caller (`MAX_PAGE`) and narrowed again by
 *     `CACHEABLE_MAX_OFFSET`.
 *
 * `q` is deliberately NOT collapsed — it is free text passed verbatim to the
 * `search_servers` RPC, so its key space is unbounded. That is precisely why
 * `isCacheableQuery` returns false for the search branch: the search results
 * are never written to the Data Cache, so an unbounded key cannot reach it.
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

/** Deepest offset whose result is worth a Data Cache entry. */
export const CACHEABLE_MAX_OFFSET = 200
/** The only `min_score` values the UI emits (components/ScoreFilterPills.tsx:6-10). */
export const CACHEABLE_MIN_SCORES = [0, 40, 60, 80] as const

/**
 * Whether this request's result may be written to (and read from) the Data
 * Cache. Everything else runs live.
 *
 * Caching is worth its write cost only where the key space is small AND the
 * repeat rate is plausible, and three inputs fail that test:
 *
 *   - the SEARCH branch: `q` is free text with a near-zero repeat rate and an
 *     unbounded key space, and /servers has no rate limiting, so an anonymous
 *     client could mint entries at request rate and evict the ~30 hot catalog
 *     keys the cache exists to hold. `/api/search` already serves the same
 *     `search_servers` RPC behind `s-maxage=900` for the traffic that repeats.
 *   - DEEP offsets: `MAX_PAGE` is 500 and the Prev/Next chain means one crawl
 *     pass would write 500 entries nobody reads back — and those are the
 *     expensive index-defeating queries, so they are the most costly to store.
 *   - off-tier `min_score`: the param accepts 101 distinct integers while the
 *     pills emit only four, so anything else is hand-crafted, non-repeating.
 */
export function isCacheableQuery(p: ServersListingParams): boolean {
  return (
    p.mode === 'catalog' &&
    p.offset <= CACHEABLE_MAX_OFFSET &&
    (CACHEABLE_MIN_SCORES as readonly number[]).includes(p.minScore)
  )
}

/**
 * Next hands `searchParams` a `string[]` for a REPEATED key (`?q=a&q=b`), so
 * every read has to collapse it before the value reaches Supabase — an array
 * passed as the RPC's `text` `search_query` errors on every attempt.
 *
 * First-wins is a deliberate, small behavior change versus `main` for
 * hand-crafted URLs only: there `?category=a&category=b` reached
 * `.contains('categories', [['a','b']])` → `cs.{a,b}`, an accidental
 * AND-of-two-values. No UI emits repeated keys (`FilterBar` and
 * `ScoreFilterPills` both use `params.set`), so first-wins is the predictable
 * replacement.
 */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

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
  raw: Record<string, string | string[] | undefined>,
  offset: number,
): NormalizedServersQuery {
  // Verbatim, no trim: `?q=%20%20` is truthy today and selects the search
  // branch. Trimming would flip it to the catalog branch — a behavior change.
  const q = first(raw.q) || ''
  const mode: ServersListingParams['mode'] = q ? 'search' : 'catalog'

  // A bogus filter value is NOT equivalent to an absent one: `?status=zzz` runs
  // `.eq('health_status','zzz')` and matches zero rows, while `?status=`
  // returns the whole catalog. Collapsing it to '' would silently turn a
  // typo into "show everything", so short-circuit instead.
  const category = filter(first(raw.category), CATEGORIES)
  const status = filter(first(raw.status), HEALTH_STATUSES)
  const pricing = filter(first(raw.pricing), API_PRICING_OPTIONS)
  const author = filter(first(raw.author), AUTHOR_TYPES)
  const transport = filter(first(raw.transport), TRANSPORTS)
  if (
    category === null ||
    status === null ||
    pricing === null ||
    author === null ||
    transport === null
  ) {
    return { kind: 'empty' }
  }

  const parsed = parseInt(first(raw.min_score) || '0', 10)
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
  const rawSort = first(raw.sort) || ''
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
