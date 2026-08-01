/**
 * Which row a registry entry should be written to, as a pure decision.
 *
 * This lives outside `bots/sync-registry.ts` for the same reason
 * `lib/registry-schema.ts` does: the bot builds an admin client and calls
 * `main()` at module scope, so nothing in it can be imported by a test. The
 * branch this encodes had two defects that only a test can keep out —
 *
 *  1. An entry whose `registry_id` already names a row used to FALL THROUGH to
 *     the insert branch whenever the entry's repo URL was not already in the
 *     catalog. That is the common shape, not an exotic one: a registry entry
 *     published without `repository` imports with `github_url = NULL`, and the
 *     day the publisher adds one, the URL is new and the row's is NULL, so
 *     neither the fast path nor the link branch fired. `servers.registry_id`
 *     has no unique index, so the resulting second row raised no 23505 — two
 *     live rows shared the id, `new Map(...)` kept whichever sorted last by
 *     UUID, and on the nights the stale one won it re-inserted `-2`, `-3`, `-4`
 *     until the slug candidates ran out. Hence the invariant below: when a row
 *     is already keyed by this `registryId`, the plan is NEVER `insert`.
 *  2. Handing the identity to a different row left `registry_id` set on the old
 *     one, so the same two-live-rows flip-flop applied to relinks. `relink`
 *     therefore carries the row to clear it off.
 */

export type RegistryRowPlan =
  /** Row already correct — just restamp `registry_synced_at`/`registry_verified`. */
  | { kind: 'refresh'; id: string }
  /** Move the registry identity to the row that actually holds the repo URL. */
  | { kind: 'relink'; targetId: string; clearRegistryIdOn: string | null }
  /** Adopt the entry's new repo URL onto the row we already own. */
  | { kind: 'adopt'; id: string; githubUrl: string }
  /** The URL is in the catalog but no row matched it exactly (see `linkMisses`). */
  | { kind: 'linkMiss'; refreshId: string | null }
  /** Genuinely new server. */
  | { kind: 'insert' }

export type PlanRegistryRowInput = {
  /** Normalized repo URL from the registry entry, or null when it declares none. */
  githubUrl: string | null
  /** The row already keyed by this entry's `registry_id`, if any. */
  existingRow: { id: string; githubUrl: string | null } | undefined
  /** Whether `githubUrl` is known to be held by some live row in the catalog. */
  urlInCatalog: boolean
  /** Resolve the live row holding `githubUrl` exactly. Only called when `urlInCatalog`. */
  findRowByUrl: (githubUrl: string) => Promise<{ id: string } | null>
  /** Compare two repo URLs the way the catalog stores them. */
  normalizeUrl: (url: string | null) => string | null
}

export async function planRegistryRowWrite(input: PlanRegistryRowInput): Promise<RegistryRowPlan> {
  const { githubUrl, existingRow, urlInCatalog, findRowByUrl, normalizeUrl } = input

  if (!existingRow) {
    if (!githubUrl || !urlInCatalog) return { kind: 'insert' }
    const target = await findRowByUrl(githubUrl)
    return target
      ? { kind: 'relink', targetId: target.id, clearRegistryIdOn: null }
      : { kind: 'linkMiss', refreshId: null }
  }

  // Same repo URL (or the entry declares none): nothing to move. This returns
  // BEFORE any `findRowByUrl` call on purpose — it is the already-synced fast
  // path taken by nearly every entry on nearly every night, and the lookup
  // behind it is a catalog-wide `ilike` scan.
  if (!githubUrl || normalizeUrl(existingRow.githubUrl) === githubUrl) {
    return { kind: 'refresh', id: existingRow.id }
  }

  // The entry's repo URL changed — a first-time `repository`, a transfer, or an
  // org rename. If another live row already holds it, that row is the one the
  // badge belongs on; otherwise keep the row we positively identified and take
  // the new URL onto it.
  const target = urlInCatalog ? await findRowByUrl(githubUrl) : null
  if (target) {
    return target.id === existingRow.id
      ? { kind: 'refresh', id: existingRow.id }
      : { kind: 'relink', targetId: target.id, clearRegistryIdOn: existingRow.id }
  }
  // The URL is believed to be in the catalog but nothing matched it exactly.
  // Writing it onto our row anyway risks forging a second row for one repo, so
  // restamp only and let the miss be counted.
  if (urlInCatalog) return { kind: 'linkMiss', refreshId: existingRow.id }

  return { kind: 'adopt', id: existingRow.id, githubUrl }
}
