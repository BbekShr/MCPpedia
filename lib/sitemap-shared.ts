import { CATEGORIES, SITE_URL } from './constants'
import { getAllBlogPosts } from './blog'
import { getAllGuides } from './mdx'
import { getAllSkills } from './skills'
import fs from 'fs'
import path from 'path'

export const SERVER_CHUNK_SIZE = 10000

// Floor on the number of server sitemaps. Chunks 1-3 have been in Search Console
// for months; never publish fewer than that even if the count read below fails.
const MIN_SERVER_CHUNKS = 3

// Hard ceiling on the shard number the route will serve. This is a DoS bound, NOT
// a coverage number — coverage comes from getServerChunkCount(), and only shards
// up to that count are ever advertised in the sitemap index. Its only job is to
// keep `fetchServerChunk`'s OFFSET finite so an arbitrary /sitemap-servers-<n>.xml
// cannot be turned into an unbounded deep scan. 100 shards is ~1M servers of
// headroom at the current chunk size; shards past the real catalog just render an
// empty <urlset>. Deliberately a constant so the shard route needs no DB read to
// validate its input — a count failure must never take the shard URLs offline.
export const MAX_SERVER_CHUNKS = 100

export interface SitemapEntry {
  url: string
  lastModified?: Date | string
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

// Render <urlset> XML from entries (matches Next.js MetadataRoute.Sitemap output).
export function renderUrlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map(e => {
      const lm = e.lastModified
        ? `<lastmod>${typeof e.lastModified === 'string' ? e.lastModified : e.lastModified.toISOString()}</lastmod>`
        : ''
      const cf = e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : ''
      const pr = e.priority !== undefined ? `<priority>${e.priority}</priority>` : ''
      return `<url><loc>${escapeXml(e.url)}</loc>${lm}${cf}${pr}</url>`
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
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/servers`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/submit`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/guides`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/badge`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/analytics`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${SITE_URL}/security`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/get-started`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/compare`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/skills`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/methodology`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const categoryEntries: SitemapEntry[] = CATEGORIES.map(c => ({
    url: `${SITE_URL}/category/${c}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const bestEntries: SitemapEntry[] = [
    { url: `${SITE_URL}/best`, changeFrequency: 'weekly', priority: 0.8 },
    ...CATEGORIES.map(c => ({
      url: `${SITE_URL}/best/${c}`,
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    })),
  ]

  const bestForEntries: SitemapEntry[] = [
    'developers', 'data-engineering', 'productivity',
    'ai-agents', 'cloud-infrastructure', 'security',
    'web-scraping', 'file-management', 'monitoring',
    'communication', 'databases', 'design-tools',
  ].map(slug => ({
    url: `${SITE_URL}/best-for/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const guideEntries: SitemapEntry[] = getAllGuides().map(g => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: g.date ? new Date(g.date) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const blogEntries: SitemapEntry[] = getAllBlogPosts().map(post => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updated || post.date),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const skillEntries: SitemapEntry[] = getAllSkills().map(s => ({
    url: `${SITE_URL}/skills/${s.slug}`,
    lastModified: s.last_updated ? new Date(s.last_updated) : undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  let comparisonEntries: SitemapEntry[] = []
  try {
    const pairsPath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
    const pairsRaw = fs.readFileSync(pairsPath, 'utf-8')
    const pairsData = JSON.parse(pairsRaw)
    comparisonEntries = (pairsData.pairs || []).map((p: { slugA: string; slugB: string }) => ({
      url: `${SITE_URL}/compare/${p.slugA}-vs-${p.slugB}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
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

// Non-archived server count, used only to size the sitemap shard set.
// Deliberately NOT `count: 'exact'` — an exact count over the whole servers
// table is a full scan and has taken the catalog down twice (S20/S28). The
// daily home_stats snapshot already holds this number (same source the /servers
// header uses); the planner estimate is the fallback if the snapshot is missing.
async function fetchServerTotal(): Promise<number> {
  // Same trigger as the mock client in lib/supabase/public.ts: with no env there
  // is no database to ask (env-less CI build), which is not a failure.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return 0
  }
  const { createPublicClient } = await import('./supabase/public')
  const supabase = createPublicClient()

  const { data, error: rpcError } = await supabase.rpc('home_stats')
  const snapshotTotal = (data as { total_servers?: number } | null)?.total_servers
  if (snapshotTotal) return snapshotTotal

  const { count, error: countError } = await supabase
    .from('servers')
    .select('id', { count: 'estimated', head: true })
    .eq('is_archived', false)
  if (!countError) return count ?? 0

  // Env is present and BOTH reads failed. Degrading to the floor here would
  // silently republish the truncated 3-shard index this item exists to fix —
  // a failure indistinguishable from success. Fail loudly instead.
  console.error('[sitemap] server count unavailable', { rpcError, countError })
  throw new Error('[sitemap] cannot size server sitemap shards: home_stats and estimated count both failed')
}

// How many /sitemap-servers-<n>.xml shards to publish. Derived from the catalog
// size, never hardcoded: three fixed chunk routes silently hid every server past
// position 30,000 once the catalog outgrew them (S29).
//
// No padding shard: a trailing empty sitemap is reported by Search Console as an
// error on every fetch. Growth between revalidations is covered by the route's
// `dynamicParams` instead, which serves one shard past this count on demand.
export async function getServerChunkCount(): Promise<number> {
  const total = await fetchServerTotal()
  // Clamped to MAX_SERVER_CHUNKS so the index can never advertise a shard the
  // route refuses to serve; reaching the clamp means raising that constant.
  return Math.min(
    MAX_SERVER_CHUNKS,
    Math.max(MIN_SERVER_CHUNKS, Math.ceil(total / SERVER_CHUNK_SIZE)),
  )
}

type SitemapClient = ReturnType<typeof import('./supabase/admin').createAdminClient>

// One row of the sitemap ordering: (score_total desc, slug asc), nulls last.
type ChunkCursor = { score_total: number | null; slug: string }

const PAGE = 1000
const ROW_FIELDS = 'slug, updated_at, score_total'

type ServerRow = { slug: string; updated_at: string; score_total: number | null }

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
async function fetchCursorAt(supabase: SitemapClient, position: number): Promise<ChunkCursor | null> {
  const scored = await supabase
    .from('servers')
    .select('slug, score_total')
    .eq('is_archived', false)
    .not('score_total', 'is', null)
    .order('score_total', { ascending: false })
    .order('slug', { ascending: true })
    .range(position, position)
  if (scored.data?.length) return scored.data[0] as ChunkCursor

  const all = await supabase
    .from('servers')
    .select('slug, score_total')
    .eq('is_archived', false)
    .order('score_total', { ascending: false, nullsFirst: false })
    .order('slug', { ascending: true })
    .range(position, position)
  return (all.data?.[0] as ChunkCursor | undefined) ?? null
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

  const startOffset = chunkIndex * SERVER_CHUNK_SIZE

  // Exclusive cursor: the last row of the previous chunk. Chunk 0 starts at the
  // top with no cursor; a chunk whose predecessor row does not exist starts past
  // the end of the catalog and is empty.
  let cursor: ChunkCursor | null = null
  if (startOffset > 0) {
    cursor = await fetchCursorAt(supabase, startOffset - 1)
    if (!cursor) return []
  }

  const out: SitemapEntry[] = []
  const push = (rows: ServerRow[]) => {
    for (const s of rows) {
      out.push({
        url: `${SITE_URL}/s/${s.slug}`,
        lastModified: new Date(s.updated_at),
        changeFrequency: 'weekly',
        priority: 0.8,
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
      .select(ROW_FIELDS)
      .eq('is_archived', false)
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
    const rows = (data ?? []) as ServerRow[]
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
      .select(ROW_FIELDS)
      .eq('is_archived', false)
      .is('score_total', null)
      .order('slug', { ascending: true })
      .limit(limit)
    if (slugCursor) query = query.gt('slug', slugCursor)

    const { data } = await query
    const rows = (data ?? []) as ServerRow[]
    push(rows)
    if (rows.length < limit) break
    slugCursor = rows[rows.length - 1].slug
  }

  return out
}
