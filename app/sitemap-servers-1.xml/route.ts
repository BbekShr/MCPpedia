import { fetchServerChunk, renderUrlset, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Chunk 0 (first 10k servers ordered by score_total desc) — high-quality URLs
// surface to Google first.
export const revalidate = 86400 // 1d

export async function GET() {
  const entries = await fetchServerChunk(0)
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS })
}
