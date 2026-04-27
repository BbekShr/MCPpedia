import { buildStaticEntries, renderUrlset, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

export const revalidate = 86400 // 1d

export async function GET() {
  return new Response(renderUrlset(buildStaticEntries()), { headers: SITEMAP_HEADERS })
}
