/**
 * Shared stub for route-level Supabase write tests.
 *
 * Consumed by `refresh-score-advisories.test.ts` and `edit-auto-approve.test.ts`;
 * a third hand-rolled copy is what this exists to prevent. It is the union of the
 * two originals, with the two behaviours they disagreed on behind flags so each
 * suite keeps the exact recording and resolve semantics it was written against:
 *
 * - `trackClient` — record which client (`authed`/`admin`) made each call. Off by
 *   default so a recorded call deep-equals `{ table, op, args }`.
 * - `keyByWriteOp` — key a builder's resolved value by the write verb it saw
 *   (`edits:insert`) instead of `edits:await`. Needed only when one table is both
 *   read and written in the same request; turning it on changes existing keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ClientKind = 'authed' | 'admin'
export type Call = { client?: ClientKind; table: string; op: string; args: unknown[] }

export interface HarnessOptions {
  trackClient?: boolean
  keyByWriteOp?: boolean
}

export interface RouteSupabaseHarness {
  /** Every builder method call, in order. */
  calls: Call[]
  /** Args every `createAdminClient` call received, in order. */
  adminClientArgs: unknown[][]
  /** Signed-in user the `createClient` stub reports; null exercises the 401 path. */
  authUser: { current: { id: string } | null }
  /** Rows the reads resolve to, keyed by `${table}:${single|await|verb}`. */
  queued: Record<string, unknown>
  /** `count` values for head-only reads, same keys. */
  queuedCounts: Record<string, number>
  /** Errors injected at a given key so the failure branches are exercised. */
  queuedErrors: Record<string, { code: string; message: string }>
  /** Clears the recordings and every injection map. Call from `beforeEach`. */
  reset(): void
  createClient(): Promise<SupabaseClient>
  createAdminClient(...args: unknown[]): SupabaseClient
}

export function createRouteSupabaseHarness(
  options: HarnessOptions = {},
): RouteSupabaseHarness {
  const { trackClient = false, keyByWriteOp = false } = options

  const calls: Call[] = []
  const adminClientArgs: unknown[][] = []
  const authUser: { current: { id: string } | null } = { current: null }

  function resolveFor(key: string) {
    return Promise.resolve({
      data: key in harness.queued ? harness.queued[key] : [],
      count: harness.queuedCounts[key] ?? null,
      error: harness.queuedErrors[key] ?? null,
    })
  }

  /**
   * A PostgREST query builder is BOTH chainable and thenable — a handler runs
   * `select().eq().single()` as readily as `update().eq()` — so every method
   * returns the builder and the builder itself resolves the queued result.
   *
   * Only the BUILDER is thenable, never the client: `await createClient()` would
   * otherwise adopt a thenable client and resolve to the query result instead.
   */
  function makeBuilder(client: ClientKind, table: string) {
    let writeOp: string | null = null
    const key = (fallback: string) =>
      `${table}:${keyByWriteOp && writeOp ? writeOp : fallback}`
    const builder = {
      _record(op: string, args: unknown[]) {
        calls.push(trackClient ? { client, table, op, args } : { table, op, args })
        return builder
      },
      select(...args: unknown[]) { return builder._record('select', args) },
      insert(...args: unknown[]) { writeOp = 'insert'; return builder._record('insert', args) },
      update(...args: unknown[]) { writeOp = 'update'; return builder._record('update', args) },
      upsert(...args: unknown[]) { writeOp = 'upsert'; return builder._record('upsert', args) },
      eq(...args: unknown[]) { return builder._record('eq', args) },
      in(...args: unknown[]) { return builder._record('in', args) },
      not(...args: unknown[]) { return builder._record('not', args) },
      single() { return resolveFor(key('single')) },
      then(resolve: (value: unknown) => unknown) {
        return resolveFor(key('await')).then(resolve)
      },
    }
    return builder
  }

  function makeStub(client: ClientKind) {
    return {
      from: (table: string) => makeBuilder(client, table),
      auth: {
        getUser: async () => ({ data: { user: authUser.current }, error: null }),
      },
    } as unknown as SupabaseClient
  }

  const harness: RouteSupabaseHarness = {
    calls,
    adminClientArgs,
    authUser,
    queued: {},
    queuedCounts: {},
    queuedErrors: {},
    reset() {
      calls.length = 0
      adminClientArgs.length = 0
      harness.queued = {}
      harness.queuedCounts = {}
      harness.queuedErrors = {}
    },
    createClient: async () => makeStub('authed'),
    createAdminClient: (...args: unknown[]) => {
      adminClientArgs.push(args)
      return makeStub('admin')
    },
  }

  return harness
}
