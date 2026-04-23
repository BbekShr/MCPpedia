import { revalidatePath } from 'next/cache'
import fs from 'fs'
import path from 'path'

// Revalidate a server detail page plus every pre-generated /compare page
// that includes the slug. Call after any write that changes what a visitor
// would see on /s/{slug} (approved edit, sync-registry pickup, etc.).
export function revalidateServer(slug: string): void {
  revalidatePath(`/s/${slug}`)
  for (const pair of loadComparisonPairs()) {
    if (pair.slugA === slug || pair.slugB === slug) {
      revalidatePath(`/compare/${pair.slugA}-vs-${pair.slugB}`)
    }
  }
}

export function revalidateProfile(username: string): void {
  revalidatePath(`/profile/${username}`)
}

interface ComparisonPair { slugA: string; slugB: string }
let pairsCache: ComparisonPair[] | null = null

function loadComparisonPairs(): ComparisonPair[] {
  if (pairsCache) return pairsCache
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'comparison-pairs.json'), 'utf-8')
    pairsCache = JSON.parse(raw).pairs ?? []
  } catch {
    pairsCache = []
  }
  return pairsCache!
}
