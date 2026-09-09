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
vi.mock('@/lib/revalidate', () => ({
  revalidateServer: () => {},
  revalidateProfile: () => {},
}))

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
    }
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
    // Byte-identical payload: the retry must not stamp a second, later
    // reviewed_at, which is why the route hoists the object.
    expect(edits[1].args[0]).toEqual(edits[0].args[0])
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
    expect(edits[1].args[0]).toEqual(edits[0].args[0])
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
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('rejects on the authed client alone', async () => {
    const res = await postApprove({ reject: true })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'rejected' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(1)
    expect(edits[0].client).toBe('authed')
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
