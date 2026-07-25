import {
  fetchServerChunk,
  getServerChunkCount,
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
// `dynamicParams` stays on (default), so shards that appear as the catalog grows
// between deploys are served on demand; only shards the index advertises are
// crawled anyway. The chunk number is validated against the static
// MAX_SERVER_CHUNKS rather than the derived count on purpose: `fetchServerChunk`
// walks with OFFSET on the service-role client (no anon statement timeout), so
// the number must be bounded (the S27 deep-offset class of bug) — but reading the
// count here would put a DB call in front of every shard URL and take them all
// offline on a transient failure. A chunk past the real catalog just renders an
// empty <urlset>.
export const revalidate = 86400 // 1d

export async function generateStaticParams() {
  const count = await getServerChunkCount()
  return Array.from({ length: count }, (_, i) => ({ chunk: String(i + 1) }))
}

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
