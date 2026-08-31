/**
 * Keeper-ordering and trust-flag-transfer decision logic for
 * `bots/detect-duplicates.ts`.
 *
 * `data_quality` used to be the primary keeper-ordering signal, but nothing in
 * the codebase ever writes it — `compute_data_quality`/`compute_all_data_quality`
 * (`supabase/migrations/20260403050000_data_quality.sql`) are defined and never
 * called — so it is a constant 0 for every row and the real tiebreak was `id`,
 * i.e. random (issues #91, #136). `compareKeeperCandidates` below is the JS
 * mirror of the SQL `ORDER BY` the bot now uses (`publisher_verified desc nulls
 * last, score_total desc nulls last, created_at asc, id asc`), kept here so the
 * ordering semantics have a direct unit test. Per `lib/duplicate-groups.ts`'s
 * header, the grouping helper must NEVER sort — production ordering is done
 * entirely by the bot's SQL query, and this comparator is not wired into that
 * path; it exists to pin the intended semantics against regression.
 *
 * `bots/detect-duplicates.ts` cannot be imported directly (it builds an admin
 * client and calls `main()` at module scope), so this extraction follows the
 * `lib/curated-merge.ts` / `lib/duplicate-groups.ts` / `lib/registry-schema.ts`
 * precedent of moving the pure decision logic out to make it testable.
 */

export type KeeperCandidate = {
  id: string
  publisher_verified: boolean | null
  score_total: number | null
  created_at: string
}

/**
 * Mirrors the bot's SQL `ORDER BY`: a claimed (publisher-verified) row beats
 * an unclaimed one regardless of score or age; among unclaimed (or equally
 * claimed) rows, higher score wins; ties go to the older row (more
 * established); `id` is the final deterministic tiebreak.
 */
export function compareKeeperCandidates(a: KeeperCandidate, b: KeeperCandidate): number {
  const aVerified = a.publisher_verified ? 1 : 0
  const bVerified = b.publisher_verified ? 1 : 0
  if (aVerified !== bVerified) return bVerified - aVerified

  const aScore = a.score_total ?? -Infinity
  const bScore = b.score_total ?? -Infinity
  if (aScore !== bScore) return bScore - aScore

  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export type TrustFlagKeeper = { publisher_verified: boolean | null }
export type TrustFlagDupe = { publisher_verified: boolean | null; claimed_by: string | null }
export type TrustFlagUpdate = { publisher_verified: true; claimed_by: string | null }

/**
 * `publisher_verified`/`claimed_by` live on the `servers` row itself, not in
 * `publisher_claims` (which IS reparented onto the keeper), so a merge that
 * only reparents child tables loses the verified badge. This can't go through
 * `lib/curated-merge.ts`'s `CURATED_FIELDS`/`isGap` machinery: `isGap` treats
 * `false` as a real value (correct for most fields), but a keeper's
 * `publisher_verified: false` must NOT block inheriting `true` from a dupe
 * that actually holds the claim — so it's an explicit, separate check.
 *
 * Returns the update to apply to the keeper, or `null` when the dupe has
 * nothing to transfer or the keeper is already verified. Called once per
 * dupe in a group; the caller applies the result to `keeper` before checking
 * the next dupe, so if multiple dupes are verified, the first one processed
 * wins deterministically and later dupes are no-ops.
 */
export function computeTrustFlagUpdate(
  keeper: TrustFlagKeeper,
  dupe: TrustFlagDupe,
): TrustFlagUpdate | null {
  if (dupe.publisher_verified !== true) return null
  if (keeper.publisher_verified === true) return null
  return { publisher_verified: true, claimed_by: dupe.claimed_by }
}
