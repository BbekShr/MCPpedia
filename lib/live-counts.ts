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
  openCves: number | null
  // True only when a read was ATTEMPTED and failed. Callers that must not cache a
  // degraded render (the ISR'd opengraph-image) throw on it; everyone else degrades.
  failed: boolean
}

export async function getCatalogCounts(): Promise<CatalogCounts> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // `failed: false` here is deliberate and load-bearing — do NOT "tidy" it to true.
    // This returns BEFORE any RPC is issued, so nothing failed; the env-less CI build
    // must render fallback copy, and a `true` here would make throwing callers break it.
    return { totalServers: null, openCves: null, failed: false }
  }
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('home_stats')
    if (error) {
      console.error('[live-counts] home_stats failed', error)
      return { totalServers: null, openCves: null, failed: true }
    }
    // home_stats returns jsonb — ONE object, never a set, so never data[0].
    const stats = data as { total_servers?: number; open_cves?: number } | null
    return {
      totalServers: stats?.total_servers ?? null,
      openCves: stats?.open_cves ?? null,
      failed: false,
    }
  } catch (error) {
    console.error('[live-counts] home_stats threw', error)
    return { totalServers: null, openCves: null, failed: true }
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

// Exact, not rounded: open_cves is a small number from the same daily snapshot,
// and rounding 364 down to a thousand would erase it. Refuses to print 0 or a
// number it did not get — the formatApproxTotal rule.
export function formatExactCount(n: number | null, fallback: string): string {
  if (n === null || n === undefined || n <= 0) return fallback
  return n.toLocaleString('en-US')
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
