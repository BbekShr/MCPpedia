import { fetchServerChunk, getServerChunkCount, renderUrlset, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Server detail pages, sharded by score_total desc — chunk 1 holds the
// highest-scored servers so Google's first-pass crawl gets the best URLs.
//
// Publicly served as /sitemap-servers-<n>.xml (1-based) through the rewrite in
// next.config.ts: that URL shape is already indexed and listed in the sitemap
// index, and a folder named `sitemap-servers-[chunk].xml` would not route — a
// dynamic segment must be the whole folder name.
//
// `dynamicParams` stays on (default) so the shard that appears as the catalog
// grows between deploys is served on demand — but only ONE past the current
// count. Anything further 404s: `fetchServerChunk` walks with OFFSET on the
// service-role client (no anon statement timeout), so an unbounded chunk number
// would let any anonymous request trigger a full ordered scan of the table and
// mint a permanent ISR entry per URL (the S27 deep-offset class of bug).
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
  if (!Number.isInteger(n) || n < 1 || n > (await getServerChunkCount()) + 1) {
    return new Response('Not found', { status: 404 })
  }
  const entries = await fetchServerChunk(n - 1)
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS })
}
