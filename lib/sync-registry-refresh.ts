/**
 * Refresh decision for a `servers` row already linked to a registry entry.
 *
 * `bots/sync-registry.ts` only ever wrote two bookkeeping columns
 * (`registry_synced_at`, `registry_verified`) on an already-linked row —
 * `transport`, `npm_package`, `pip_package`, `description`, `tagline` and
 * `github_url` were written ONLY on first INSERT. So a linked row can never
 * self-heal: 16,472 of 54,045 rows carry `transport = '{NULL}'`, a dead value
 * from an old registry schema shape, and none were created after 2026-08-01
 * (verified in prod) — the insert-path parser is fine, the update path just
 * never ran it. Issues #108/#130/#128 all trace to this.
 *
 * This module is the pure "what should change" decision, extracted so it is
 * testable without a Supabase client — `bots/sync-registry.ts` cannot be
 * imported directly (it builds an admin client and calls `main()` at module
 * scope), the same reason `lib/curated-merge.ts` and `lib/registry-schema.ts`
 * exist as standalone modules.
 *
 * Every field here is a GAP-FILL, never a clobber, with one exception:
 * `description`/`tagline` refresh from the registry whenever the row is not
 * `description_source: 'human'` — mirroring the BACKLOG S88 lesson that a bot
 * must never overwrite moderated, human-authored text, but otherwise treating
 * the registry as the source of truth for its own short blurb.
 */

import { isMissingValue } from './curated-merge'
import { type Transport } from './constants'

export type LinkedRowCurrent = {
  transport: (string | null)[] | null
  npm_package: string | null
  pip_package: string | null
  description: string | null
  tagline: string | null
  description_source: string | null
  github_url: string | null
}

export type LinkedRowParsed = {
  transports: Transport[]
  npmPackage: string | null
  pipPackage: string | null
  description: string | null
  githubUrl: string | null
}

export type LinkedRowRefresh = {
  /** Fields to write, on top of the caller's own `registry_synced_at`/`registry_verified` stamp. */
  update: Record<string, unknown>
  /** Which fields changed — for the per-row audit log. */
  changedFields: string[]
  /** A repo-transfer was detected but skipped because the new URL already belongs to another row. */
  transferSkippedCollision: boolean
}

/**
 * A `transport` value counts as a gap even when it is non-empty, because the
 * old registry parser wrote literal drift shapes instead of leaving the
 * column at its real default (`text[] default '{}'`) — a Postgres array
 * literal of `[null]` (renders as `{NULL}`), or the string `'NULL'` in the
 * same slot. `isMissingValue` alone only catches null/empty, not these.
 */
function isTransportGap(transport: LinkedRowCurrent['transport']): boolean {
  if (isMissingValue(transport)) return true
  return Array.isArray(transport) && transport.every(t => t === null || t === 'NULL')
}

/**
 * Build the update for one already-linked row, or an empty update if nothing
 * needs to change.
 *
 * `otherGithubUrls` must be every OTHER row's normalized `github_url` — the
 * caller's already-loaded `getExistingGithubUrls()` set works unmodified,
 * since a row's own (pre-transfer) URL is never equal to `parsed.githubUrl`
 * by the time this runs (that equality is checked first).
 *
 * `checkGithubTransfer` must be false from the URL-link fallback branch: that
 * branch already matched the row BY its (normalized) github_url, so any
 * remaining string difference from `parsed.githubUrl` is a normalization
 * artifact, not a repo transfer, and must not be treated as one.
 */
export function buildLinkedRowRefresh(
  current: LinkedRowCurrent,
  parsed: LinkedRowParsed,
  otherGithubUrls: Set<string>,
  checkGithubTransfer = true
): LinkedRowRefresh {
  const update: Record<string, unknown> = {}
  const changedFields: string[] = []
  let transferSkippedCollision = false

  if (isTransportGap(current.transport) && parsed.transports.length > 0) {
    update.transport = parsed.transports
    changedFields.push('transport')
  }

  if (isMissingValue(current.npm_package) && parsed.npmPackage) {
    update.npm_package = parsed.npmPackage
    changedFields.push('npm_package')
  }

  if (isMissingValue(current.pip_package) && parsed.pipPackage) {
    update.pip_package = parsed.pipPackage
    changedFields.push('pip_package')
  }

  if (current.description_source !== 'human' && parsed.description) {
    if (parsed.description !== current.description) {
      update.description = parsed.description
      changedFields.push('description')
    }
    if (parsed.description !== current.tagline) {
      update.tagline = parsed.description
      changedFields.push('tagline')
    }
  }

  if (checkGithubTransfer && parsed.githubUrl && parsed.githubUrl !== current.github_url) {
    if (otherGithubUrls.has(parsed.githubUrl)) {
      transferSkippedCollision = true
    } else {
      update.github_url = parsed.githubUrl
      changedFields.push('github_url')
    }
  }

  return { update, changedFields, transferSkippedCollision }
}
