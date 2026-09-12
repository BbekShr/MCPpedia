/**
 * Route-level regression test for S104: /api/admin/approve-edit must not ignore
 * the result of its `edits` bookkeeping write. Both branches used to discard the
 * error AND the affected row count, and the approve path is the damaging one —
 * the `servers` change has already landed through the admin client, so a no-op
 * bookkeeping write leaves the edit `status='pending'` against an already-changed
 * server: the queue keeps showing it and re-approving double-applies.
 *
 * All three harness flags are on. `trackClient` because "which client performed
 * the write" is the whole point of the retry cases. `keyByClient` because the
 * approve path writes `edits` through BOTH clients in one request — without the
 * prefix the first attempt and the service-role retry share a resolve key, so no
 * test could make the retry succeed after the first attempt failed. `keyByWriteOp`
 * so `edits:update` stays readable against the `edits:single` read of the same
 * table rather than collapsing into an opaque `:await`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouteSupabaseHarness } from './helpers/route-supabase-stub'

const harness = createRouteSupabaseHarness({
  trackClient: true,
  keyByWriteOp: true,
  keyByClient: true,
})
const { calls, adminClientArgs, authUser } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: harness.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: harness.createAdminClient }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitUser: async () => ({ allowed: true, remaining: 199, resetAt: Date.now() + 1000 }),
}))
// The real module calls next/cache and reads data/comparison-pairs.json off disk.
// Spies, not no-ops: the double-failure branch must purge the ISR entry for the
// server it already changed, and that is only observable here.
const revalidate = vi.hoisted(() => ({
  revalidateServer: vi.fn(),
  revalidateProfile: vi.fn(),
}))
vi.mock('@/lib/revalidate', () => revalidate)

/** `edit_id` is `z.string().uuid()` — anything else 400s before the role gate. */
const EDIT_ID = '00000000-0000-4000-8000-00000000ed17'
const SERVER_ID = '00000000-0000-4000-8000-000000000001'

async function postApprove(body: Record<string, unknown> = {}) {
  const { POST } = await import('@/app/api/admin/approve-edit/route')
  return POST(new Request('http://localhost/api/admin/approve-edit', {
    method: 'POST',
    body: JSON.stringify({ edit_id: EDIT_ID, ...body }),
  }))
}

const serversUpdated = () => calls.filter(c => c.table === 'servers' && c.op === 'update')
const editsUpdated = () => calls.filter(c => c.table === 'edits' && c.op === 'update')
const notificationInserts = () =>
  calls.filter(c => c.table === 'notifications' && c.op === 'insert')

describe('POST /api/admin/approve-edit — bookkeeping write is checked', () => {
  beforeEach(() => {
    harness.reset()
    authUser.current = { id: 'user-1' }
    harness.queued = {
      'authed:profiles:single': { role: 'maintainer' },
      // Proposer ≠ caller, so the self-approval block above does not fire.
      'authed:edits:single': {
        id: EDIT_ID,
        server_id: SERVER_ID,
        user_id: 'user-2',
        field_name: 'npm_package',
        new_value: 'foo',
        status: 'pending',
      },
      'authed:edits:update': [{ id: EDIT_ID }],
      'admin:edits:update': [{ id: EDIT_ID }],
      'authed:servers:single': { slug: 'example' },
      // The `servers` write is checked now, so it must return the row it matched.
      'admin:servers:update': [{ id: SERVER_ID, slug: 'example' }],
    }
    revalidate.revalidateServer.mockClear()
    revalidate.revalidateProfile.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('approves without touching the service role for bookkeeping', async () => {
    const res = await postApprove()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'approved' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(1)
    expect(edits[0].client).toBe('authed')
    // Pin the terminators. Without `.select('id')` supabase-js returns no rows at
    // all, so the route's zero-row check would send EVERY approve through the
    // service role and 500 every reject — and the stub cannot tell the two chains
    // apart, so only the recorded call proves the projection is still there.
    expect(calls).toContainEqual({ client: 'authed', table: 'edits', op: 'select', args: ['id'] })
    expect(calls).toContainEqual({ client: 'admin', table: 'servers', op: 'select', args: ['id, slug'] })
    // One admin client, for the `servers` write only — the retry must stay unused
    // on the happy path rather than becoming the default write route.
    expect(adminClientArgs).toHaveLength(1)
  })

  it('retries through the service role when the authed write ERRORS', async () => {
    harness.queuedErrors['authed:edits:update'] = { code: '42501', message: 'denied' }

    const res = await postApprove()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'approved' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(2)
    expect(edits.map(e => e.client)).toEqual(['authed', 'admin'])
    // The SAME OBJECT, not merely an equal one: the harness records args by
    // reference, and `toEqual` passes against a re-inlined payload whenever both
    // `new Date().toISOString()` calls land in the same millisecond.
    expect(edits[1].args[0]).toBe(edits[0].args[0])
    expect(calls).toContainEqual({ client: 'admin', table: 'edits', op: 'select', args: ['id'] })
    // The existing admin client is reused — no second createAdminClient, which
    // would drop the x-original-actor-id header the audit trigger reads.
    expect(adminClientArgs).toHaveLength(1)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(notificationInserts()).toHaveLength(1)
  })

  it('retries through the service role when the authed write matches ZERO ROWS', async () => {
    harness.queued['authed:edits:update'] = []

    const res = await postApprove()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'approved' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(2)
    expect(edits.map(e => e.client)).toEqual(['authed', 'admin'])
    expect(edits[1].args[0]).toBe(edits[0].args[0])
    expect(calls).toContainEqual({ client: 'admin', table: 'edits', op: 'select', args: ['id'] })
    expect(adminClientArgs).toHaveLength(1)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(notificationInserts()).toHaveLength(1)
  })

  it('500s when both the write and the retry match ZERO ROWS', async () => {
    harness.queued['authed:edits:update'] = []
    harness.queued['admin:edits:update'] = []

    const res = await postApprove()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/needs operator attention/),
    })

    // The servers change is applied exactly once and deliberately NOT rolled
    // back — the 500 tells the moderator about the partial state instead.
    expect(serversUpdated()).toHaveLength(1)
    // No "approved" notification for a state that was never recorded.
    expect(notificationInserts()).toEqual([])
    // ...but the ISR entry MUST be purged: the servers change is live, so leaving
    // /s/example cached would serve the old value for the 7-day TTL.
    expect(revalidate.revalidateServer).toHaveBeenCalledWith('example')
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('500s when both the write and the retry ERROR', async () => {
    harness.queuedErrors['authed:edits:update'] = { code: '42501', message: 'denied' }
    harness.queuedErrors['admin:edits:update'] = { code: '42501', message: 'denied' }

    const res = await postApprove()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/needs operator attention/),
    })
    expect(serversUpdated()).toHaveLength(1)
    expect(notificationInserts()).toEqual([])
    expect(revalidate.revalidateServer).toHaveBeenCalledWith('example')
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('500s when the `servers` write matches ZERO ROWS', async () => {
    // `edits.server_id` is ON DELETE CASCADE, but a concurrent delete can still
    // land between the read and the write; the update then resolves error-free
    // having changed nothing.
    harness.queued['admin:servers:update'] = []

    const res = await postApprove()

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Server row not found; nothing was applied and the edit is still pending',
    })

    // Nothing applied means nothing to record and nothing to purge.
    expect(editsUpdated()).toEqual([])
    expect(notificationInserts()).toEqual([])
    expect(revalidate.revalidateServer).not.toHaveBeenCalled()
  })

  it('rejects on the authed client alone', async () => {
    const res = await postApprove({ reject: true })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'rejected' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(1)
    expect(edits[0].client).toBe('authed')
    // Same reason as the approve happy path: without `.select('id')` this write
    // returns no rows and the route 500s while the rejection actually landed.
    expect(calls).toContainEqual({ client: 'authed', table: 'edits', op: 'select', args: ['id'] })
    expect(adminClientArgs).toEqual([])
  })

  it('500s on reject when the write matches ZERO ROWS, without a retry', async () => {
    harness.queued['authed:edits:update'] = []

    const res = await postApprove({ reject: true })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to record the rejection; the edit is still pending',
    })

    // Nothing was applied to `servers` on this path, so the asymmetry is
    // deliberate: no service-role retry, nothing to recover.
    expect(adminClientArgs).toEqual([])
    expect(serversUpdated()).toEqual([])
    expect(notificationInserts()).toEqual([])
  })

  it('500s on reject when the write ERRORS, without a retry', async () => {
    harness.queuedErrors['authed:edits:update'] = { code: '42501', message: 'denied' }

    const res = await postApprove({ reject: true })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to record the rejection; the edit is still pending',
    })
    expect(adminClientArgs).toEqual([])
    expect(serversUpdated()).toEqual([])
    expect(notificationInserts()).toEqual([])
  })
})
