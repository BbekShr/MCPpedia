/**
 * Gap-filling for duplicate merges.
 *
 * `detect-duplicates` re-parents the child tables (reviews, edits, claims,
 * discussions) onto the keeper, but a *column* only ever exists on one row.
 * Archiving the duplicate that happens to hold the only copy of `homepage_url`
 * or the `api_*` block silently destroys community edits that went through
 * moderation, and takes the keeper's documentation score down with them
 * (`homepage_url` and `api_name` are a point each in scoreDocumentation).
 *
 * So before archiving, copy the fields the bots cannot re-derive from the repo.
 * Fill a gap on the keeper, never overwrite a value it already holds: the
 * keeper won its group on data_quality and its own values stay authoritative.
 */

// Deliberately excludes anything a bot refreshes on its own (stars, commit
// dates, scores, health) and anything identity-shaped (slug, name, github_url,
// npm_package) — a wrong merge there leaves dead links and broken installs.
export const CURATED_FIELDS = [
  'description',
  'tagline',
  'homepage_url',
  'license',
  'api_name',
  'api_pricing',
  'api_rate_limits',
  'install_configs',
  'tools',
  'resources',
  'prompts',
  'env_instructions',
  'prerequisites',
] as const

export type CuratedField = (typeof CURATED_FIELDS)[number]

/** Empty JSONB (`[]`, `{}`) and empty strings are gaps, not curated values. */
export function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

// `api_pricing` is NOT NULL with an 'unknown' default, so its gap looks like a
// value. Anything else in the enum was set deliberately and must survive.
function isGap(field: CuratedField, value: unknown): boolean {
  if (field === 'api_pricing') return isMissingValue(value) || value === 'unknown'
  return isMissingValue(value)
}

/**
 * Returns only the fields worth writing to the keeper — empty object when the
 * keeper already has everything, so the caller can skip the update entirely.
 */
export function pickCuratedBackfill(
  keeper: Record<string, unknown>,
  dupe: Record<string, unknown>
): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const field of CURATED_FIELDS) {
    if (isGap(field, keeper[field]) && !isGap(field, dupe[field])) {
      updates[field] = dupe[field]
    }
  }
  return updates
}
