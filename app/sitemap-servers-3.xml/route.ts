import { fetchServerChunk, renderUrlset, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Chunk 2 (servers 20001+ ordered by score_total desc).
export const revalidate = 86400 // 1d

export async function GET() {
  const entries = await fetchServerChunk(2)
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS })
}
