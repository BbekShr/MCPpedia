import { SITE_URL } from '@/lib/constants'
import { getServerChunkCount, renderSitemapIndex, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Sitemap index. Splits the catalog into chunks so Google can crawl shards
// independently — a single 20k-URL sitemap was correlating with high
// "Discovered – currently not indexed" counts in Search Console because the
// crawl budget gets spread thin and freshness signals get diluted.
//
// Static + listing + comparisons + skills/guides/blog go in /sitemap-static.xml.
// Server detail pages are sharded by score_total desc into /sitemap-servers-<n>.xml
// so the first chunk surfaces the highest-quality URLs first. The shard count is
// derived from the catalog size (getServerChunkCount) — it used to be three
// hardcoded entries, which left every server past position 30,000 out of every
// sitemap once the catalog grew past that (S29).

export const revalidate = 86400 // 1d

export async function GET() {
  const now = new Date().toISOString()
  const chunkCount = await getServerChunkCount()
  const sitemaps = [
    { loc: `${SITE_URL}/sitemap-static.xml`, lastmod: now },
    ...Array.from({ length: chunkCount }, (_, i) => ({
      loc: `${SITE_URL}/sitemap-servers-${i + 1}.xml`,
      lastmod: now,
    })),
  ]
  return new Response(renderSitemapIndex(sitemaps), { headers: SITEMAP_HEADERS })
}
