/**
 * Freshness probe — the org's minimum-viable ops alarm.
 *
 * Two snapshot tables carry the homepage and /security: `home_stats_cache`
 * (hero totals + /security, refreshed by `refresh_home_stats_cache()`) and
 * `home_aggregates_cache` (the use-case and category sections, refreshed by
 * `refresh_home_aggregates_cache()`). Both refreshes run in the daily
 * compute-scores bot. The first froze silently for two weeks once (backlog S8)
 * — the daily bot swallowed the error and nobody noticed the site was showing
 * fortnight-old totals.
 *
 * This probe fails loudly if either cache is stale. It runs on its own schedule,
 * so a `refreshed_at` going stale means either compute-scores stopped running or
 * its refresh step is failing — exactly the silent-failure class we want an
 * alert for. A non-zero exit makes the GitHub Action red (which emails the repo
 * owner), and the fleet-wide failure workflow opens a tracking issue.
 */
import { createAdminClient } from './lib/supabase'

const MAX_STALENESS_MS = 48 * 60 * 60 * 1000 // 48h

/** Returns false (rather than exiting) so one stale snapshot cannot hide the other's status. */
async function checkSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select('refreshed_at')
    .limit(1)
    .maybeSingle()

  if (error) {
    // PGRST205 = relation not in PostgREST's schema cache; 42P01 = undefined_table.
    // Either means the migration that creates this snapshot has not been applied
    // yet. Migrations are applied by hand here (they do not auto-apply on
    // deploy), so between merging a new snapshot table and a human running the
    // file there is a window where the probe would go red four times a day. A
    // permanently-red probe destroys the staleness signal for the OTHER table in
    // the same run — the exact silent-freeze class (S8) this probe exists to
    // catch — and alert-on-failure.yml watches this workflow, so a permanently
    // red bot masks genuine failures (the rule stated at bots/compute-scores.ts:410-417).
    // This tolerance covers ONLY the manual-apply gap: every other read error,
    // the >48h stale case, and the never-been-built case still fail.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      console.warn(
        `freshness-probe: ${table} does not exist yet — its migration has not been applied. Skipping.`,
      )
      return true
    }
    console.error(`freshness-probe: could not read ${table}: ${error.message}`)
    return false
  }
  if (!data?.refreshed_at) {
    console.error(`freshness-probe: ${table} has no row — the snapshot has never been built.`)
    return false
  }

  const refreshedAt = new Date(data.refreshed_at).getTime()
  const ageMs = Date.now() - refreshedAt
  const ageHours = (ageMs / 3_600_000).toFixed(1)

  if (ageMs > MAX_STALENESS_MS) {
    console.error(
      `freshness-probe: ${table} is STALE — refreshed ${ageHours}h ago ` +
        `(threshold 48h). compute-scores likely stopped running or its refresh step is failing.`,
    )
    return false
  }

  console.log(`freshness-probe: OK — ${table} refreshed ${ageHours}h ago (< 48h).`)
  return true
}

async function main() {
  const supabase = createAdminClient('freshness-probe')

  // Await both before deciding: reporting only the first failure would leave the
  // second table's status unknown in the run log.
  const results = [
    await checkSnapshot(supabase, 'home_stats_cache'),
    await checkSnapshot(supabase, 'home_aggregates_cache'),
  ]

  if (results.some(ok => !ok)) process.exit(1)
}

main().catch(err => {
  console.error(`freshness-probe: unexpected error: ${String(err)}`)
  process.exit(1)
})
