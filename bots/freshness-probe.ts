/**
 * Freshness probe — the org's minimum-viable ops alarm.
 *
 * The homepage hero and /security read from `home_stats_cache`, refreshed by the
 * daily compute-scores bot (`refresh_home_stats_cache()`). That refresh froze
 * silently for two weeks once (backlog S8) — the daily bot swallowed the error
 * and nobody noticed the site was showing fortnight-old totals.
 *
 * This probe fails loudly if the cache is stale. It runs on its own schedule, so
 * `home_stats_cache.refreshed_at` going stale means either compute-scores stopped
 * running or its refresh step is failing — exactly the silent-failure class we
 * want an alert for. A non-zero exit makes the GitHub Action red (which emails
 * the repo owner), and the fleet-wide failure workflow opens a tracking issue.
 */
import { createAdminClient } from './lib/supabase'

const MAX_STALENESS_MS = 48 * 60 * 60 * 1000 // 48h

async function main() {
  const supabase = createAdminClient('freshness-probe')

  const { data, error } = await supabase
    .from('home_stats_cache')
    .select('refreshed_at')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(`freshness-probe: could not read home_stats_cache: ${error.message}`)
    process.exit(1)
  }
  if (!data?.refreshed_at) {
    console.error('freshness-probe: home_stats_cache has no row — the snapshot has never been built.')
    process.exit(1)
  }

  const refreshedAt = new Date(data.refreshed_at).getTime()
  const ageMs = Date.now() - refreshedAt
  const ageHours = (ageMs / 3_600_000).toFixed(1)

  if (ageMs > MAX_STALENESS_MS) {
    console.error(
      `freshness-probe: home_stats_cache is STALE — refreshed ${ageHours}h ago ` +
        `(threshold 48h). compute-scores likely stopped running or its refresh step is failing.`,
    )
    process.exit(1)
  }

  console.log(`freshness-probe: OK — home_stats_cache refreshed ${ageHours}h ago (< 48h).`)
}

main().catch(err => {
  console.error(`freshness-probe: unexpected error: ${String(err)}`)
  process.exit(1)
})
