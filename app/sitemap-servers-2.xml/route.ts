import { fetchServerChunk, renderUrlset, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Chunk 1 (servers 10001+ ordered by score_total desc).
export const revalidate = 86400 // 1d

export async function GET() {
  const entries = await fetchServerChunk(1)
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS })
}
