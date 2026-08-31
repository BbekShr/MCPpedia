/**
 * Duplicate grouping for `bots/detect-duplicates.ts`.
 *
 * The bot archives every row in a group except the keeper, and archiving is
 * effectively irreversible (update-metadata is archive-forward only), so the
 * decision of *what counts as a group* is worth testing on its own. The bot
 * itself cannot be imported — it builds an admin client and calls `main()` at
 * module scope — so the decision lives here, mirroring `lib/curated-merge.ts`.
 *
 * Three invariants the caller depends on:
 *
 * 1. **This helper must never sort.** `keep = group[0]` is correct ONLY because
 *    the caller orders its query by `publisher_verified desc nullsFirst:false,
 *    score_total desc nullsFirst:false, created_at asc, id asc`
 *    (detect-duplicates.ts) — the keeper rule lives in the SQL `ORDER BY`, and
 *    `Map` preserving insertion order is what carries it here. A helper that
 *    re-sorted would silently change which row survives an irreversible archive.
 * 2. A group is returned only when it holds **two or more distinct ids**. The
 *    same row appearing twice (an offset-pagination hazard when the caller's
 *    ordering is not unique) is not a duplicate group, and returning it would
 *    have the bot archive the keeper itself.
 * 3. Returning zero groups for that case does NOT make the bot's
 *    `dupe.id === keep.id` guard (detect-duplicates.ts:224-226) redundant — it
 *    is a second, independent layer in front of the archive write and stays.
 */

import { normalizeGithubUrl } from './normalize'

/**
 * Known monorepos that contain multiple distinct MCP servers — never a
 * duplicate group. Compared post-normalization, so an entry pasted with mixed
 * case, `http://` or a `.git` suffix still matches.
 */
export const MONOREPO_URLS = [
  'https://github.com/modelcontextprotocol/servers',
  'https://github.com/mintmcp/servers',
  'https://github.com/ryudi84/sovereign-mcp-servers',
  'https://github.com/dave-london/pare',
  'https://github.com/mansurjisan/ocean-mcp',
  'https://github.com/iowarp/clio-kit',
  'https://github.com/martc03/gov-mcp-servers',
  'https://github.com/la-rebelion/hapimcp',
  'https://github.com/waystation-ai/mcp',
] as const

const NORMALIZED_MONOREPO_URLS = new Set(
  MONOREPO_URLS.map(u => normalizeGithubUrl(u)).filter((u): u is string => !!u),
)

export function isMonorepoUrl(normalizedUrl: string): boolean {
  return NORMALIZED_MONOREPO_URLS.has(normalizedUrl)
}

// `github_url` is nullable in the schema, and the first guard below exists
// precisely for the absent case — the bot only ever passes non-null rows because
// of its own `.not('github_url','is',null)` filter.
type HasIdAndUrl = { id: string; github_url: string | null | undefined }

export type DuplicateGroup<T> = { url: string; keep: T; dupes: T[] }

/**
 * Groups servers by normalized GitHub URL, in the order the caller supplied
 * them, and returns only the groups that hold two or more distinct ids.
 */
export function buildDuplicateGroups<T extends HasIdAndUrl>(
  servers: T[],
): Array<DuplicateGroup<T>> {
  const byUrl = new Map<string, T[]>()

  for (const server of servers) {
    const url = normalizeGithubUrl(server.github_url)
    if (!url) continue
    if (isMonorepoUrl(url)) continue
    if (!byUrl.has(url)) byUrl.set(url, [])
    byUrl.get(url)!.push(server)
  }

  const groups: Array<DuplicateGroup<T>> = []
  for (const [url, rawGroup] of byUrl) {
    // Defence in depth against the same row appearing twice: the caller's
    // `.order('id')` tiebreak should make it impossible, but archiving is
    // effectively irreversible, so never trust the group's shape — dedupe by id
    // BEFORE deciding whether this is a real group.
    const group = [...new Map(rawGroup.map(s => [s.id, s])).values()]
    if (group.length <= 1) continue
    groups.push({ url, keep: group[0], dupes: group.slice(1) })
  }
  return groups
}
