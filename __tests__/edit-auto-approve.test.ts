/**
 * Route-level regression test for S48: an auto-approved edit was inserted with
 * status='approved' through the AUTHED client, but the `edits` INSERT policy
 * pins `auth.uid() = user_id AND status = 'pending'`
 * (20260610000000_security_hardening.sql:28-35) — so every low-risk edit by a
 * trusted contributor was RLS-denied and the route 500'd instead of applying it.
 *
 * "Which client performed the insert" is the whole assertion, so the authed and
 * admin stubs are DISTINCT and every recorded call carries its client. The
 * harness is adapted from refresh-score-advisories.test.ts rather than shared
 * with it: extracting a common helper is a follow-up, not this fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

type ClientKind = 'authed' | 'admin'
type Call = { client: ClientKind; table: string; op: string; args: unknown[] }

const calls: Call[] = []
/** Args every `createAdminClient` call received, in order. */
const adminClientArgs: unknown[][] = []
/** Rows the awaited reads resolve to, keyed by `${table}:${verb}`. */
let queued: Record<string, unknown> = {}
/** `count` values for head-only reads, same keys. */
let queuedCounts: Record<string, number> = {}
/** Errors injected at a given key so the failure branches are exercised. */
let queuedErrors: Record<string, { code: string; message: string }> = {}

/**
 * A PostgREST query builder is BOTH chainable and thenable, so every method
 * returns the builder and the builder itself resolves the queued result. It
 * also remembers the write verb it saw: without that, the trust count read and
 * the revert update on `edits` would collide on one resolve key.
 *
 * Only the BUILDER is thenable, never the client: `await createClient()` would
 * otherwise adopt a thenable client and resolve to the query result instead.
 */
function makeBuilder(client: ClientKind, table: string) {
  let writeOp: string | null = null
  const builder = {
    _record(op: string, args: unknown[]) {
      calls.push({ client, table, op, args })
      return builder
    },
    select(...args: unknown[]) { return builder._record('select', args) },
    insert(...args: unknown[]) { writeOp = 'insert'; return builder._record('insert', args) },
    update(...args: unknown[]) { writeOp = 'update'; return builder._record('update', args) },
    eq(...args: unknown[]) { return builder._record('eq', args) },
    not(...args: unknown[]) { return builder._record('not', args) },
    single() { return resolveFor(`${table}:${writeOp ?? 'single'}`) },
    then(resolve: (value: unknown) => unknown) {
      return resolveFor(`${table}:${writeOp ?? 'await'}`).then(resolve)
    },
  }
  return builder
}

function resolveFor(key: string) {
  return Promise.resolve({
    data: key in queued ? queued[key] : [],
    count: queuedCounts[key] ?? null,
    error: queuedErrors[key] ?? null,
  })
}

/** Signed-in user the `createClient` stub reports; null exercises the 401 path. */
const authUser = vi.hoisted(() => ({ current: { id: 'user-1' } as { id: string } | null }))

function makeStub(client: ClientKind) {
  return {
    from: (table: string) => makeBuilder(client, table),
    auth: {
      getUser: async () => ({ data: { user: authUser.current }, error: null }),
    },
  } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeStub('authed') }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => {
    adminClientArgs.push(args)
    return makeStub('admin')
  },
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitUser: async () => ({ allowed: true, remaining: 19, resetAt: Date.now() + 1000 }),
}))
// The real module calls next/cache and reads data/comparison-pairs.json off disk.
vi.mock('@/lib/revalidate', () => ({
  revalidateServer: () => {},
  revalidateProfile: () => {},
}))

const SERVER_ID = '00000000-0000-4000-8000-000000000001'

async function postEdit(field_name = 'tagline') {
  const { POST } = await import('@/app/api/edit/route')
  return POST(new Request('http://localhost/api/edit', {
    method: 'POST',
    body: JSON.stringify({
      server_id: SERVER_ID,
      field_name,
      old_value: 'old',
      new_value: 'new tagline',
      edit_reason: 'better wording',
    }),
  }))
}

const editInserts = () => calls.filter(c => c.table === 'edits' && c.op === 'insert')
const serversUpdated = () => calls.filter(c => c.table === 'servers' && c.op === 'update')

describe('POST /api/edit — auto-approve client routing', () => {
  beforeEach(() => {
    calls.length = 0
    adminClientArgs.length = 0
    authUser.current = { id: 'user-1' }
    queued = {
      'servers:single': { id: 'srv-1', slug: 'example' },
      'profiles:single': { role: 'contributor', username: 'bob' },
      'edits:insert': { id: 'edit-1' },
    }
    queuedCounts = { 'edits:await': 3 }
    queuedErrors = {}
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inserts a trusted contributor\'s approved edit through the ADMIN client', async () => {
    const res = await postEdit()
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ autoApproved: true })

    const inserts = editInserts()
    expect(inserts).toHaveLength(1)
    expect(inserts[0].client).toBe('admin')
    expect(inserts[0].args[0]).toMatchObject({ status: 'approved' })

    const updates = serversUpdated()
    expect(updates).toHaveLength(1)
    expect(updates[0].client).toBe('admin')

    // The two-arg form is load-bearing: x-original-actor-id makes the audit
    // trigger credit the proposer rather than the service role.
    expect(adminClientArgs[0]).toEqual(['auto-approved', 'user-1'])
  })

  it('inserts an untrusted contributor\'s pending edit through the AUTHED client', async () => {
    queuedCounts = { 'edits:await': 2 }

    const res = await postEdit()
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ autoApproved: false })

    const inserts = editInserts()
    expect(inserts).toHaveLength(1)
    expect(inserts[0].client).toBe('authed')
    expect(inserts[0].args[0]).toMatchObject({ status: 'pending' })
    expect(serversUpdated()).toHaveLength(0)
  })

  it('ignores a forged profiles.edits_approved counter', async () => {
    queued['profiles:single'] = { role: 'contributor', username: 'bob', edits_approved: 99 }
    queuedCounts = { 'edits:await': 0 }

    const res = await postEdit()
    expect(res.status).toBe(201)

    const inserts = editInserts()
    expect(inserts[0].client).toBe('authed')
    expect(inserts[0].args[0]).toMatchObject({ status: 'pending' })
    expect(serversUpdated()).toHaveLength(0)
  })

  it('never even selects the forgeable counter column', async () => {
    await postEdit()

    const profileSelects = calls.filter(c => c.table === 'profiles' && c.op === 'select')
    expect(profileSelects).toHaveLength(1)
    expect(JSON.stringify(profileSelects[0].args)).not.toContain('edits_approved')
  })

  it('reverts to pending through the ADMIN client when the apply fails', async () => {
    queuedErrors['servers:update'] = { code: '42501', message: 'denied' }

    const res = await postEdit()
    expect(res.status).toBe(500)

    expect(calls).toContainEqual({
      client: 'admin',
      table: 'edits',
      op: 'update',
      args: [{ status: 'pending', reviewed_at: null }],
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('reads the revert\'s own error rather than discarding it', async () => {
    queuedErrors['servers:update'] = { code: '42501', message: 'denied' }
    queuedErrors['edits:update'] = { code: '42501', message: 'revert denied' }

    const res = await postEdit()
    expect(res.status).toBe(500)
    // Once for the failed apply, once for the failed revert.
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('skips the trust count entirely for a privileged role', async () => {
    queued['profiles:single'] = { role: 'editor', username: 'eve' }
    queuedCounts = {}

    const res = await postEdit()
    expect(res.status).toBe(201)

    // The insert chain ends in `.select().single()`, so an `edits`/select call
    // exists regardless — the trust count is the one carrying a count option.
    const countReads = calls.filter(
      c => c.table === 'edits' && c.op === 'select' && (c.args[1] as { count?: string } | undefined)?.count,
    )
    expect(countReads).toHaveLength(0)
    const inserts = editInserts()
    expect(inserts[0].client).toBe('admin')
    expect(inserts[0].args[0]).toMatchObject({ status: 'approved' })
  })

  it('fails CLOSED when the trust count read errors', async () => {
    queuedErrors['edits:await'] = { code: '57014', message: 'statement timeout' }

    const res = await postEdit()
    expect(res.status).toBe(201)

    const inserts = editInserts()
    expect(inserts[0].client).toBe('authed')
    expect(inserts[0].args[0]).toMatchObject({ status: 'pending' })
    expect(serversUpdated()).toHaveLength(0)
  })

  // The other half of the `isLowRisk` gate: every case above posts 'tagline', so a
  // refactor dropping isLowRisk from shouldAutoApprove would let a privileged role
  // push an npm_package swap through the service role with the suite still green.
  it('never auto-approves a NON-low-risk field, even for a privileged role', async () => {
    queued['profiles:single'] = { role: 'admin', username: 'eve' }

    const res = await postEdit('npm_package')
    expect(res.status).toBe(201)

    const inserts = editInserts()
    expect(inserts).toHaveLength(1)
    expect(inserts[0].client).toBe('authed')
    expect(inserts[0].args[0]).toMatchObject({ status: 'pending' })
    expect(serversUpdated()).toHaveLength(0)
    expect(adminClientArgs).toEqual([])
  })

  // The trust count must exclude this route's own self-issued approvals
  // (status 'approved' with reviewed_by null), or auto-approve feeds itself.
  it('counts only moderator-reviewed approvals toward the trust threshold', async () => {
    await postEdit()

    const countRead = calls.findIndex(
      c => c.table === 'edits' && c.op === 'select' && (c.args[1] as { count?: string } | undefined)?.count,
    )
    expect(countRead).toBeGreaterThanOrEqual(0)
    expect(calls).toContainEqual({
      client: 'authed',
      table: 'edits',
      op: 'not',
      args: ['reviewed_by', 'is', null],
    })
  })

  // Companion to the call-shape assertion above. The stub resolves counts from
  // `queuedCounts` and so cannot distinguish a filtered read from an unfiltered
  // one — this pins only the below-threshold branch, not the filter itself.
  it('stays pending when the trust count is below the threshold', async () => {
    queuedCounts = { 'edits:await': 0 }

    const res = await postEdit()
    expect(res.status).toBe(201)

    const inserts = editInserts()
    expect(inserts[0].client).toBe('authed')
    expect(inserts[0].args[0]).toMatchObject({ status: 'pending' })
    expect(serversUpdated()).toHaveLength(0)
  })

  it('fails CLOSED when the profile read errors', async () => {
    queuedErrors['profiles:single'] = { code: '57014', message: 'statement timeout' }
    queuedCounts = { 'edits:await': 3 }

    const res = await postEdit()
    expect(res.status).toBe(201)

    const inserts = editInserts()
    expect(inserts[0].client).toBe('authed')
    expect(inserts[0].args[0]).toMatchObject({ status: 'pending' })
    expect(serversUpdated()).toHaveLength(0)
    expect(console.error).toHaveBeenCalled()
  })

  it('rejects an anonymous caller with 401 and touches nothing', async () => {
    authUser.current = null

    const res = await postEdit()
    expect(res.status).toBe(401)
    expect(calls).toEqual([])
  })
})
