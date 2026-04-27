import { SITE_URL } from '@/lib/constants'
import { renderSitemapIndex, SITEMAP_HEADERS } from '@/lib/sitemap-shared'

// Sitemap index. Splits the catalog into chunks so Google can crawl shards
// independently — a single 20k-URL sitemap was correlating with high
// "Discovered – currently not indexed" counts in Search Console because the
// crawl budget gets spread thin and freshness signals get diluted.
//
// Static + listing + comparisons + skills/guides/blog go in /sitemap-static.xml.
// Server detail pages are sharded by score_total desc into /sitemap-servers-<n>.xml
// so the first chunk surfaces the highest-quality URLs first.

export const revalidate = 86400 // 1d

export async function GET() {
  const now = new Date().toISOString()
  const sitemaps = [
    { loc: `${SITE_URL}/sitemap-static.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-servers-1.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-servers-2.xml`, lastmod: now },
  ]
  return new Response(renderSitemapIndex(sitemaps), { headers: SITEMAP_HEADERS })
}
