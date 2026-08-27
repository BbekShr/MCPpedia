import pairsData from '@/data/comparison-pairs.json'

export interface ComparisonPair {
  slugA: string
  slugB: string
  nameA: string
  nameB: string
  category?: string
}

// Imported, not read with fs. /compare, /compare/[slugs], /sitemap.xml and the
// on-demand revalidate path all reach this at request time, and Cloudflare
// Workers have no filesystem. bots/generate-comparisons.ts still writes the
// same data/comparison-pairs.json; only the read side changed.
//
// Written score-descending by the bot — callers that slice a prefix (the
// prerender cut in /compare/[slugs]) depend on that order.
export function getComparisonPairs(): ComparisonPair[] {
  return (pairsData.pairs ?? []) as ComparisonPair[]
}
