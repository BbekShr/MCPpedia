import { revalidatePath } from 'next/cache'
import { getComparisonPairs } from '@/lib/comparison-pairs'

// Revalidate a server detail page plus every pre-generated /compare page
// that includes the slug. Call after any write that changes what a visitor
// would see on /s/{slug} (approved edit, sync-registry pickup, etc.).
export function revalidateServer(slug: string): void {
  revalidatePath(`/s/${slug}`)
  // The OG image is its own ISR entry (7d) — purging only the page would leave
  // the social card stale (or a pre-creation 404 pinned).
  revalidatePath(`/s/${slug}/opengraph-image`)
  for (const pair of getComparisonPairs()) {
    if (pair.slugA === slug || pair.slugB === slug) {
      revalidatePath(`/compare/${pair.slugA}-vs-${pair.slugB}`)
    }
  }
}

export function revalidateProfile(username: string): void {
  revalidatePath(`/profile/${username}`)
}
