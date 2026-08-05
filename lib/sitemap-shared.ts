import { CATEGORIES, SITE_URL } from './constants'
import { getAllBlogPosts } from './blog'
import { getAllGuides } from './mdx'
import { getAllSkills } from './skills'
import { isServerIndexable, type IndexableServerFields } from './seo'
import fs from 'fs'
import path from 'path'

export const SERVER_CHUNK_SIZE = 10000

// Floor on the number of server sitemaps. Was 3, because chunks 1-3 had been in
// Search Console for months. It is 1 now: the sitemap only carries servers that
// pass `isServerIndexable`, which is ~13.5k of the 36.6k non-archived catalog,
// so a floor of 3 would force two empty shards — and Search Console reports an
// empty sitemap as an error on every fetch. Shards that fall off the index stay
// SERVABLE (the route still answers up to MAX_SERVER_CHUNKS); they are simply no
// longer advertised, which is the intended shrink.
const MIN_SERVER_CHUNKS = 1

// Hard ceiling on the shard number the route will serve. This is a DoS bound, NOT
// a coverage number — coverage comes from getServerChunkCount(), and only shards
// up to that count are ever advertised in the sitemap index. Its only job is to
// keep `fetchServerChunk`'s OFFSET finite so an arbitrary /sitemap-servers-<n>.xml
// cannot be turned into an unbounded deep scan. 100 shards is ~1M servers of
// headroom at the current chunk size; shards past the real catalog just render an
// empty <urlset>. Deliberately a constant so the shard route needs no DB read to
// validate its input — a count failure must never take the shard URLs offline.
export const MAX_SERVER_CHUNKS = 100

// No changefreq/priority. Google has said for years that it ignores both, and
// carrying them cost us: every URL claimed `weekly` and a hand-picked priority
// that no crawler ever read, while making the files larger.
export interface SitemapEntry {
  url: string
  lastModified?: Date | string
}

// Render <urlset> XML from entries.
export function renderUrlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map(e => {
      const lm = e.lastModified
        ? `<lastmod>${typeof e.lastModified === 'string' ? e.lastModified : e.lastModified.toISOString()}</lastmod>`
        : ''
      return `<url><loc>${escapeXml(e.url)}</loc>${lm}</url>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
}

export function renderSitemapIndex(sitemaps: { loc: string; lastmod?: string }[]): string {
  const items = sitemaps
    .map(s => `<sitemap><loc>${escapeXml(s.loc)}</loc>${s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : ''}</sitemap>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
} as const

// Static + categories + best-for + blog + guides + skills + comparisons.
export function buildStaticEntries(): SitemapEntry[] {
  const staticPages: SitemapEntry[] = [
    // Trailing slash deliberate: the homepage canonical is `https://mcppedia.org/`
    // and a sitemap <loc> that disagrees with the canonical is a conflicting
    // signal on the single most important URL on the site.
    { url: `${SITE_URL}/` },
    { url: `${SITE_URL}/servers` },
    { url: `${SITE_URL}/submit` },
    { url: `${SITE_URL}/guides` },
    { url: `${SITE_URL}/blog` },
    { url: `${SITE_URL}/about` },
    { url: `${SITE_URL}/badge` },
    { url: `${SITE_URL}/analytics` },
    { url: `${SITE_URL}/security` },
    { url: `${SITE_URL}/get-started` },
    { url: `${SITE_URL}/compare` },
    { url: `${SITE_URL}/skills` },
    { url: `${SITE_URL}/methodology` },
    // Safe to submit now that GET /mcp answers a browser Accept header with a
    // real 200 HTML page instead of the protocol's 406.
    { url: `${SITE_URL}/mcp` },
    { url: `${SITE_URL}/faq` },
  ]

  const categoryEntries: SitemapEntry[] = CATEGORIES.map(c => ({
    url: `${SITE_URL}/category/${c}`,
  }))

  const bestEntries: SitemapEntry[] = [
    { url: `${SITE_URL}/best` },
    ...CATEGORIES.map(c => ({ url: `${SITE_URL}/best/${c}` })),
  ]

  const bestForEntries: SitemapEntry[] = [
    'developers', 'data-engineering', 'productivity',
    'ai-agents', 'cloud-infrastructure', 'security',
    'web-scraping', 'file-management', 'monitoring',
    'communication', 'databases', 'design-tools',
  ].map(slug => ({ url: `${SITE_URL}/best-for/${slug}` }))

  const guideEntries: SitemapEntry[] = getAllGuides().map(g => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: g.date ? new Date(g.date) : undefined,
  }))

  const blogEntries: SitemapEntry[] = getAllBlogPosts().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updated || post.date),
  }))

  const skillEntries: SitemapEntry[] = getAllSkills().map(s => ({
    url: `${SITE_URL}/skills/${s.slug}`,
    lastModified: s.last_updated ? new Date(s.last_updated) : undefined,
  }))

  let comparisonEntries: SitemapEntry[] = []
  try {
    const pairsPath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
    const pairsRaw = fs.readFileSync(pairsPath, 'utf-8')
    const pairsData = JSON.parse(pairsRaw)
    comparisonEntries = (pairsData.pairs || []).map((p: { slugA: string; slugB: string }) => ({
      url: `${SITE_URL}/compare/${p.slugA}-vs-${p.slugB}`,
    }))
  } catch {
    // No pairs file yet
  }

  return [
    ...staticPages,
    ...categoryEntries,
    ...bestEntries,
    ...bestForEntries,
    ...guideEntries,
    ...blogEntries,
    ...skillEntries,
    ...comparisonEntries,
  ]
}

// PostgREST pre-filter mirroring `isServerIndexable` (lib/seo.tsx).
//
// `isServerIndexable` stays the single authority — every row this query returns
// is run through it again in `push()` below, so if the two ever drift the TS
// predicate wins and the sitemap is still correct. This exists only so the
// database does not ship 23k rows we would immediately discard, and so the
// count can ride the partial index added in
// supabase/migrations/20260804120000_content_updated_at.sql.
//
// `has_description` is the generated column added by the same migration: it
// stores `btrim(coalesce(description,'')) <> ''`, i.e. the predicate's own trim
// semantics, so the filter matches the gate exactly without downloading the
// description text of 13.5k rows on every render.
function indexableFilter(seoColumns: boolean): string {
  return [
    seoColumns ? 'has_description.is.true' : 'description.not.is.null',
    'and(tool_count.gt.0,score_total.gte.40)',
    'score_total.gte.60',
    'review_count.gt.0',
    'community_verified.is.true',
  ].join(',')
}

// `has_description` and `content_updated_at` only exist once
// supabase/migrations/20260804120000_content_updated_at.sql has been applied. A
// deploy can reach production ahead of its migration, and selecting a missing
// column is a hard PostgREST error that would take every sitemap URL to 500 —
// so one cheap probe per render decides which shape to ask for. The flag is
// cached for the life of the process; a cold start after the migration lands
// picks up the real columns.
//
// The degraded path costs the description egress this column exists to avoid and
// emits NO lastmod at all. Deliberately not `updated_at`: that column is what
// made every URL claim to change daily, and quietly re-introducing it is worse
// than publishing no lastmod, which Google simply treats as unknown.
let seoColumnsAvailable: boolean | null = null

async function probeSeoColumns(supabase: {
  from: (t: string) => { select: (f: string) => { limit: (n: number) => PromiseLike<{ error: unknown }> } }
}): Promise<boolean> {
  if (seoColumnsAvailable !== null) return seoColumnsAvailable
  const { error } = await supabase.from('servers').select('has_description, content_updated_at').limit(1)
  seoColumnsAvailable = !error
  if (error) console.warn('[sitemap] content_updated_at/has_description unavailable; emitting no lastmod', error)
  return seoColumnsAvailable
}

// Count of servers the sitemap will actually emit, used only to size the shard
// set. This must be the INDEXABLE count, not the catalog count — sizing shards
// off 36.6k while emitting 13.5k URLs would advertise two shards that render
// empty, which Search Console reports as an error on every fetch.
//
// How many /sitemap-servers-<n>.xml shards to publish. Derived from the data,
// never hardcoded: three fixed chunk routes silently hid every server past
// position 30,000 once the catalog outgrew them (S29).
//
// This asks the question shard-wise rather than counting: "does the indexable
// set have a row at position N × 10,000?" — one single-row seek per shard, the
// same seek `fetchServerChunk` already performs to find its own start. Two
// probes settle today's 13.5k.
//
// It replaced a `count: 'exact'` over the indexable predicate, which does not
// work: on the anon role that count hits the statement timeout outright
// (verified against production), and on the service role it is a sequential
// scan of 66k rows — 12s cold, 2s warm — which is the exact query shape that
// took the catalog down in S20/S28. The estimated count is not a substitute
// either: the planner puts this set at 23,296 against a true 13,458, a 73%
// overshoot, i.e. one entirely empty shard advertised to Search Console.
//
// Probing is also strictly more correct than counting: the answer comes from
// the same ordering and filter the shards are built from, so the index can
// never advertise a shard the walk then renders empty.
//
// No padding shard: a trailing empty sitemap is reported by Search Console as an
// error on every fetch. Growth between revalidations is covered by the route's
// `dynamicParams` instead, which serves one shard past this count on demand.
export async function getServerChunkCount(): Promise<number> {
  // Same trigger as the mock client in lib/supabase/public.ts: with no env there
  // is no database to ask (env-less CI build), which is not a failure.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return MIN_SERVER_CHUNKS
  }
  const { createAdminClient } = await import('./supabase/admin')
  const supabase = createAdminClient('sitemap')
  const filter = indexableFilter(await probeSeoColumns(supabase))

  // Clamped to MAX_SERVER_CHUNKS so the index can never advertise a shard the
  // route refuses to serve; reaching the clamp means raising that constant.
  for (let shard = 1; shard < MAX_SERVER_CHUNKS; shard++) {
    const start = await fetchCursorAt(supabase, shard * SERVER_CHUNK_SIZE, filter)
    if (!start) return Math.max(MIN_SERVER_CHUNKS, shard)
  }
  return MAX_SERVER_CHUNKS
}

type SitemapClient = ReturnType<typeof import('./supabase/admin').createAdminClient>

// One row of the sitemap ordering: (score_total desc, slug asc), nulls last.
type ChunkCursor = { score_total: number | null; slug: string }

const PAGE = 1000

const GATE_FIELDS = 'is_archived, tool_count, score_total, review_count, community_verified'

function rowFields(seoColumns: boolean): string {
  return seoColumns
    ? `slug, ${GATE_FIELDS}, has_description, content_updated_at`
    : `slug, ${GATE_FIELDS}, description`
}

type ServerRow = {
  slug: string
  score_total: number | null
  is_archived?: boolean | null
  tool_count?: number | null
  review_count?: number | null
  community_verified?: boolean | null
  has_description?: boolean | null
  description?: string | null
  content_updated_at?: string | null
}

// Feed the row to the single gate. `has_description` already encodes the
// predicate's trim, so it maps back to a non-blank/blank description rather than
// being second-guessed here.
function toGateInput(row: ServerRow): IndexableServerFields {
  return {
    description: row.has_description !== undefined ? (row.has_description ? 'x' : null) : row.description,
    tool_count: row.tool_count,
    score_total: row.score_total,
    is_archived: row.is_archived,
    review_count: row.review_count,
    community_verified: row.community_verified,
  }
}

// PostgREST filter values are comma/paren separated, so a value is double-quoted
// and its quotes/backslashes escaped. Slugs are generated as [a-z0-9-] and these
// values come from the database rather than a request, but quoting keeps the
// filter well-formed regardless of what a slug turns out to contain.
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// Locate the row at an absolute position in the sitemap ordering. Shards are
// defined by absolute position (chunk N = rows N*10000 …), so a keyset walk still
// needs one seek to find where a chunk begins — but ONE one-row probe instead of
// the ten deep-offset page queries the walk used to issue per shard.
//
// The first probe stays inside the scored rows so it can ride
// `servers_score_active_idx (score_total DESC) WHERE is_archived = false`
// (supabase/migrations/20260417210424_hot_query_indexes.sql:22-24): PostgreSQL's
// DESC default is NULLS FIRST, which is what that index stores, so asking for
// `nullsFirst: false` — as the old walk did on every page — makes the ordering
// unsatisfiable by the index and forces a full sort of the whole table. Positions
// below the scored-row count are identical in both orderings, so this is only a
// cheaper way to ask the same question. If it comes up empty the position lies in
// the null-score tail, and only then do we pay the unindexed ordering.
//
// Positions are now positions in the INDEXABLE set, not the catalog: the seek
// carries the same `indexableFilter` as the walk, so shard N still begins where
// shard N-1 ended.
async function fetchCursorAt(
  supabase: SitemapClient,
  position: number,
  filter: string,
): Promise<ChunkCursor | null> {
  const scored = await supabase
    .from('servers')
    .select('slug, score_total')
    .eq('is_archived', false)
    .or(filter)
    .not('score_total', 'is', null)
    .order('score_total', { ascending: false })
    .order('slug', { ascending: true })
    .range(position, position)
  if (scored.error) throw asSeekError(position, scored.error)
  if (scored.data?.length) return scored.data[0] as ChunkCursor

  const all = await supabase
    .from('servers')
    .select('slug, score_total')
    .eq('is_archived', false)
    .or(filter)
    .order('score_total', { ascending: false, nullsFirst: false })
    .order('slug', { ascending: true })
    .range(position, position)
  if (all.error) throw asSeekError(position, all.error)
  return (all.data?.[0] as ChunkCursor | undefined) ?? null
}

// A failed seek and an empty seek are indistinguishable in the data, and
// `getServerChunkCount` reads "empty" as "the catalog ends here". Swallowing the
// error would publish a truncated sitemap index — the S29 failure, arrived at
// from the other direction — so it fails loudly and lets the CDN's
// stale-while-revalidate serve the last good file.
function asSeekError(position: number, error: { message?: string }): Error {
  console.error('[sitemap] cursor seek failed', { position, error })
  return new Error(`[sitemap] cursor seek failed at position ${position}: ${error.message ?? 'unknown error'}`)
}

// Fetch a chunk of servers ordered by score_total descending.
// Higher-scored servers go in chunk 0 so Google's first-pass crawl prioritizes
// the better content. Paginated through Supabase to bypass the default 1k limit.
//
// Pagination is keyset, not OFFSET (S11): the old `.range()` walk re-scanned and
// re-sorted everything before the page on each of its ten requests, which is
// O(n²) across a shard and blew Vercel's 60s per-route prerender budget as soon
// as a fourth shard pushed the last one to offset 30,000.
export async function fetchServerChunk(chunkIndex: number): Promise<SitemapEntry[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return []
  }
  const { createAdminClient } = await import('./supabase/admin')
  const supabase = createAdminClient('sitemap')

  const seoColumns = await probeSeoColumns(supabase)
  const filter = indexableFilter(seoColumns)
  const fields = rowFields(seoColumns)

  const startOffset = chunkIndex * SERVER_CHUNK_SIZE

  // Exclusive cursor: the last row of the previous chunk. Chunk 0 starts at the
  // top with no cursor; a chunk whose predecessor row does not exist starts past
  // the end of the catalog and is empty.
  let cursor: ChunkCursor | null = null
  if (startOffset > 0) {
    cursor = await fetchCursorAt(supabase, startOffset - 1, filter)
    if (!cursor) return []
  }

  const out: SitemapEntry[] = []
  const push = (rows: ServerRow[]) => {
    for (const s of rows) {
      // Second pass through the gate. The PostgREST filter above already
      // excluded the obvious misses; this is what makes `isServerIndexable` —
      // not the hand-written filter string — the thing that decides what Google
      // is asked to index, so the sitemap and the meta robots tag cannot drift.
      if (!isServerIndexable(toGateInput(s))) continue
      out.push({
        url: `${SITE_URL}/s/${s.slug}`,
        // No lastmod rather than a churning one when the column is missing.
        lastModified: s.content_updated_at ? new Date(s.content_updated_at) : undefined,
      })
    }
  }

  // Phase 1 — scored rows, (score_total desc, slug asc). Nulls are excluded here
  // and swept up in phase 2, which is what keeps the emitted order identical to
  // the old `nullsFirst: false` ordering while letting phase 1 use the index.
  // `score_total` has only `default 0`, no NOT NULL constraint
  // (supabase/migrations/20260402010000_scores_security_registry.sql:6), so the
  // null tail is unlikely but not impossible — and a null can neither satisfy nor
  // fail `score_total < cursor`, so a single-phase walk would drop it silently.
  let scoreCursor = cursor?.score_total ?? null
  let slugCursor = cursor?.slug ?? ''
  let inNullTail = cursor !== null && cursor.score_total === null

  while (!inNullTail && out.length < SERVER_CHUNK_SIZE) {
    const limit = Math.min(PAGE, SERVER_CHUNK_SIZE - out.length)
    let query = supabase
      .from('servers')
      .select(fields)
      .eq('is_archived', false)
      .or(filter)
      .not('score_total', 'is', null)
      .order('score_total', { ascending: false })
      .order('slug', { ascending: true })
      .limit(limit)

    if (scoreCursor !== null) {
      // `.lte` is redundant with the `.or()` below, but it is the part the planner
      // can turn into an index range — an OR alone degrades into a bitmap scan
      // plus a sort, which is the cost this rewrite exists to remove.
      query = query
        .lte('score_total', scoreCursor)
        .or(
          `score_total.lt.${scoreCursor},and(score_total.eq.${scoreCursor},slug.gt.${quoteFilterValue(slugCursor)})`,
        )
    }

    const { data } = await query
    const rows = (data ?? []) as unknown as ServerRow[]
    push(rows)

    // Short page: the scored rows are exhausted, so this chunk continues into the
    // null tail (if any) from its start.
    if (rows.length < limit) {
      inNullTail = true
      slugCursor = ''
      break
    }
    const last = rows[rows.length - 1]
    scoreCursor = last.score_total
    slugCursor = last.slug
  }

  // Phase 2 — the null-score tail, ordered by slug asc, reached either by running
  // out of scored rows above or by starting inside it.
  while (inNullTail && out.length < SERVER_CHUNK_SIZE) {
    const limit = Math.min(PAGE, SERVER_CHUNK_SIZE - out.length)
    let query = supabase
      .from('servers')
      .select(fields)
      .eq('is_archived', false)
      .or(filter)
      .is('score_total', null)
      .order('slug', { ascending: true })
      .limit(limit)
    if (slugCursor) query = query.gt('slug', slugCursor)

    const { data } = await query
    const rows = (data ?? []) as unknown as ServerRow[]
    push(rows)
    if (rows.length < limit) break
    slugCursor = rows[rows.length - 1].slug
  }

  return out
}
