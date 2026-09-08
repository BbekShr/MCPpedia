/**
 * Route-level regression test for S100: POST /api/username updated `profiles`
 * on the AUTHED client with no `.select()`, so the client sent
 * `Prefer: return=minimal` and PostgREST answered 204. Postgres raises 42501
 * only on an RLS WITH CHECK violation — a row excluded by a policy's USING
 * clause is simply not updated, with NO error — so `updateErr` was null, neither
 * the 23505 branch nor the 500 branch fired, and the route returned
 * 200 {ok:true} having written nothing. /welcome then rendered the celebration
 * while /auth/callback kept bouncing the user back because username_set was
 * still false.
 *
 * Distinct from the S58/S66 trap (an error exists and is ignored): here there is
 * no error at all, so only the returned ROW COUNT can distinguish a real write
 * from a silently filtered one.
 *
 * `keyByWriteOp` is on because the pre-flight availability count and the update
 * both resolve off `profiles` in one request — without it they would collide on
 * a single `profiles:await` key. `trackClient` stays off so a recorded call
 * deep-equals `{ table, op, args }`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouteSupabaseHarness } from './helpers/route-supabase-stub'

const harness = createRouteSupabaseHarness({ keyByWriteOp: true })
const { calls, authUser } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: harness.createClient }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitUser: async () => ({ allowed: true, remaining: 9, resetAt: Date.now() + 1000 }),
}))

async function postUsername(username = 'alice') {
  const { POST } = await import('@/app/api/username/route')
  return POST(new Request('http://localhost/api/username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  }))
}

describe('POST /api/username — zero-row write detection', () => {
  beforeEach(() => {
    harness.reset()
    authUser.current = { id: 'user-1' }
  })

  it('does NOT report success when the RLS-filtered update writes zero rows', async () => {
    harness.queued = { 'profiles:update': [] }

    const res = await postUsername()

    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = await res.json()
    expect(body).not.toMatchObject({ ok: true })
    expect(body.error).toBeTruthy()
    // 500, not 403: neither cause (a USING-clause exclusion, or a missing
    // profiles row) is anything the caller can resolve.
    expect(res.status).toBe(500)
    // The route is rate-limited 10/hour, so a message inviting a retry would
    // walk the user into a 429 on a condition that never clears.
    expect(body.error).not.toMatch(/try again/i)
    expect(body.error).not.toEqual('Failed to set username.')
  })

  it('returns the existing success shape when one row comes back', async () => {
    harness.queued = { 'profiles:update': [{ id: 'user-1' }] }

    const res = await postUsername()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, username: 'alice' })
  })

  it('asks the update for its affected rows rather than return=minimal', async () => {
    harness.queued = { 'profiles:update': [{ id: 'user-1' }] }

    await postUsername()

    const updateIndex = calls.findIndex(c => c.table === 'profiles' && c.op === 'update')
    expect(updateIndex).toBeGreaterThanOrEqual(0)
    expect(calls[updateIndex].args[0]).toEqual({ username: 'alice', username_set: true })
    // A select AFTER the update is what makes PostgREST return the rows; a
    // select only before it (the availability probe) leaves the write blind.
    expect(calls.slice(updateIndex).some(c => c.table === 'profiles' && c.op === 'select')).toBe(true)
  })

  it('still maps a 23505 unique-violation to 409', async () => {
    harness.queuedErrors = {
      'profiles:update': { code: '23505', message: 'duplicate key value violates unique constraint' },
    }

    const res = await postUsername()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'That username is taken.' })
  })

  it('still maps any other update error to 500', async () => {
    harness.queuedErrors = {
      'profiles:update': { code: '42703', message: 'column does not exist' },
    }

    const res = await postUsername()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to set username.' })
  })

  it('still rejects a name another profile already holds before updating', async () => {
    harness.queuedCounts = { 'profiles:await': 1 }

    const res = await postUsername()

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'That username is taken.' })
    expect(calls.some(c => c.op === 'update')).toBe(false)
  })

  it('rejects an unauthenticated caller with 401', async () => {
    authUser.current = null

    const res = await postUsername()

    expect(res.status).toBe(401)
    expect(calls.some(c => c.op === 'update')).toBe(false)
  })
})
