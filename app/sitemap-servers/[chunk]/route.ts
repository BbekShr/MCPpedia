import { fetchServerChunk, getServerChunkCount, renderUrlset, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Server detail pages, sharded by score_total desc — chunk 1 holds the
// highest-scored servers so Google's first-pass crawl gets the best URLs.
//
// Publicly served as /sitemap-servers-<n>.xml (1-based) through the rewrite in
// next.config.ts: that URL shape is already indexed and listed in the sitemap
// index, and a folder named `sitemap-servers-[chunk].xml` would not route — a
// dynamic segment must be the whole folder name.
//
// `dynamicParams` stays on (default) so a shard beyond the build-time count is
// still served on demand as the catalog grows between deploys.
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
  if (!Number.isInteger(n) || n < 1) {
    return new Response('Not found', { status: 404 })
  }
  const entries = await fetchServerChunk(n - 1)
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS })
}
