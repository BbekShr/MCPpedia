import { createPublicClient } from './supabase/public'
import { SITE_DESCRIPTION } from './constants'

// One live source for "how many servers does MCPpedia track?".
//
// That number was hardcoded in four places and they all disagreed: SITE_DESCRIPTION
// and both llms.txt routes said "17,000+", the README said "19,000+", the Dataset
// JSON-LD said 36,614 and the public API said 36,477. Answer engines quote whichever
// they read, so the site was actively teaching them a wrong number — and a stale
// number is the single easiest thing for a reader to catch us being wrong about.
//
// `home_stats` is the same daily snapshot the homepage hero, /servers header,
// /about and /security already read, so every surface agrees by construction. An
// exact count over the servers table exceeds anon's 3s statement timeout (and has
// taken the catalog down twice), which is why the snapshot exists.

export interface CatalogCounts {
  totalServers: number | null
}

export async function getCatalogCounts(): Promise<CatalogCounts> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { totalServers: null }
  }
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('home_stats')
    if (error) {
      console.error('[live-counts] home_stats failed', error)
      return { totalServers: null }
    }
    return { totalServers: (data as { total_servers?: number } | null)?.total_servers ?? null }
  } catch (error) {
    console.error('[live-counts] home_stats threw', error)
    return { totalServers: null }
  }
}

// "36,000+" — rounded DOWN to the nearest thousand so the claim is always true
// even between snapshots, and never more precise than a daily snapshot earns.
// Falls back to the generic phrasing rather than printing a number we could not
// verify; a missing number is recoverable, a wrong one is what gets quoted.
export function formatApproxTotal(total: number | null, fallback = 'thousands of'): string {
  if (!total || total < 1000) return fallback
  return `${(Math.floor(total / 1000) * 1000).toLocaleString('en-US')}+`
}

// The site description with the live count folded in, for surfaces that can
// await one. Falls back to the count-free SITE_DESCRIPTION rather than guessing.
export function buildSiteDescription(total: number | null): string {
  if (!total || total < 1000) return SITE_DESCRIPTION
  return (
    `Discover and compare ${formatApproxTotal(total)} MCP servers — each scored on security, ` +
    `maintenance, and efficiency with real CVE scanning. Find the right server before you install.`
  )
}
