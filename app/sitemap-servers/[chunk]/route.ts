import {
  fetchServerChunk,
  MAX_SERVER_CHUNKS,
  renderUrlset,
  SITEMAP_HEADERS,
} from '@/lib/sitemap-shared'

// Server detail pages, sharded by score_total desc — chunk 1 holds the
// highest-scored servers so Google's first-pass crawl gets the best URLs.
//
// Publicly served as /sitemap-servers-<n>.xml (1-based) through the rewrite in
// next.config.ts: that URL shape is already indexed and listed in the sitemap
// index, and a folder named `sitemap-servers-[chunk].xml` would not route — a
// dynamic segment must be the whole folder name.
//
// `dynamicParams` stays on (default) and there is deliberately NO
// `generateStaticParams`: every shard is generated on first request and then
// held by ISR for `revalidate`, exactly as an over-the-clamp shard already was.
// Prerendering the shard set here meant `getServerChunkCount()` — and therefore
// Supabase — ran during `next build`, so a transient database outage failed the
// whole deploy rather than one sitemap URL (S8: four consecutive Vercel builds
// died in `Collecting page data`, one of them on a markdown-only diff, while
// `home_stats` was returning gateway timeouts). A build must not depend on
// runtime data being reachable. The count still gates coverage — the sitemap
// index only ever advertises shards up to it — it is just read at request time
// now, where a failure costs one 500 that the CDN rides out on
// stale-while-revalidate instead of costing the deploy.
//
// The chunk number is validated against the static MAX_SERVER_CHUNKS rather than
// the derived count on purpose: `fetchServerChunk` walks with OFFSET on the
// service-role client (no anon statement timeout), so the number must be bounded
// (the S27 deep-offset class of bug) — but reading the count here would put a DB
// call in front of every shard URL and take them all offline on a transient
// failure. A chunk past the real catalog just renders an empty <urlset>.
export const revalidate = 86400 // 1d

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chunk: string }> },
) {
  const { chunk } = await params
  const n = Number(chunk)
  if (!Number.isInteger(n) || n < 1 || n > MAX_SERVER_CHUNKS) {
    return new Response('Not found', { status: 404 })
  }
  const entries = await fetchServerChunk(n - 1)
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS })
}
