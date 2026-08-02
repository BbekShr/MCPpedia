/**
 * Route-level regression test for S31: /api/admin/approve-edit must refuse to
 * approve an edit whose proposer is the caller, for EVERY privileged role. The
 * route's own comment (approve-edit/route.ts:89-106) explains why: /api/edit
 * has a one-step self-approval path, but it is bounded to LOW_RISK_FIELDS, so
 * without this block one account could queue an identity/install edit there
 * (`name`, `homepage_url`, `npm_package`, `pip_package`) and immediately approve
 * it here — leaving dead links and broken installs behind a single pair of eyes.
 *
 * Self-REJECTION stays permitted: withdrawing your own pending edit is
 * legitimate, and case (c) pins that the block did not creep above the reject
 * branch.
 *
 * `trackClient` is on because "which client performed the write" is half of what
 * case (b) asserts. `keyByWriteOp` is NOT needed here: the harness builds a fresh
 * builder per `from()` call, so the `edits` read and the `edits` write never share
 * a resolve key.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouteSupabaseHarness } from './helpers/route-supabase-stub'

const harness = createRouteSupabaseHarness({ trackClient: true })
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

/** The pending edit under review. `new_value` carries the case+space that pins
 *  the npm_package normalization at approve-edit/route.ts:120-123. */
function pendingEdit(user_id: string) {
  return {
    id: EDIT_ID,
    server_id: SERVER_ID,
    user_id,
    field_name: 'npm_package',
    new_value: 'Foo ',
    status: 'pending',
  }
}

const serversUpdated = () => calls.filter(c => c.table === 'servers' && c.op === 'update')
const editsUpdated = () => calls.filter(c => c.table === 'edits' && c.op === 'update')

describe('POST /api/admin/approve-edit — self-approval block', () => {
  beforeEach(() => {
    harness.reset()
    authUser.current = { id: 'user-1' }
    harness.queued = {
      'profiles:single': { role: 'editor' },
      'edits:single': pendingEdit('user-1'),
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks an editor approving their own edit and writes nothing', async () => {
    const res = await postApprove()

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Cannot approve your own edit' })

    // The service-role client is never even constructed, so the block sits above
    // the privileged write rather than merely discarding its result.
    expect(adminClientArgs).toEqual([])
    expect(calls.filter(c => c.table === 'servers')).toEqual([])
    // The edit must also not be marked approved — a 403 that still stamped the
    // row would let the second reviewer's queue lose it.
    expect(editsUpdated()).toEqual([])
  })

  it('still approves ANOTHER user\'s edit through the admin client', async () => {
    harness.queued['edits:single'] = pendingEdit('user-2')

    const res = await postApprove()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'approved' })

    // The SECOND argument is the load-bearing one: x-original-actor-id makes the
    // audit trigger credit the proposer rather than the approving moderator. The
    // first is a free-text actor label, so it is deliberately not pinned.
    expect(adminClientArgs).toHaveLength(1)
    expect(adminClientArgs[0]?.[1]).toBe('user-2')

    const updates = serversUpdated()
    expect(updates).toHaveLength(1)
    expect(updates[0].client).toBe('admin')
    // Lowercased and trimmed — normalizePackageName runs so the value collapses
    // against the dedup index instead of minting a near-duplicate.
    expect(updates[0].args[0]).toEqual({ npm_package: 'foo' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(1)
    expect(edits[0].client).toBe('authed')
    expect(edits[0].args[0]).toMatchObject({ status: 'approved', reviewed_by: 'user-1' })
  })

  it('still lets the proposer REJECT their own pending edit', async () => {
    const res = await postApprove({ reject: true })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, action: 'rejected' })

    const edits = editsUpdated()
    expect(edits).toHaveLength(1)
    expect(edits[0].args[0]).toMatchObject({ status: 'rejected', reviewed_by: 'user-1' })
    expect(serversUpdated()).toEqual([])
  })

  // The route deliberately blocks admins too (route.ts:104-106): an admin
  // approving their own identity edit defeats the review exactly as much as an
  // editor doing so. Without this case, relaxing the check to `editor`-only
  // would stay green.
  it('blocks an ADMIN self-approving, not just an editor', async () => {
    harness.queued['profiles:single'] = { role: 'admin' }

    const res = await postApprove()

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Cannot approve your own edit' })
    expect(adminClientArgs).toEqual([])
    expect(serversUpdated()).toEqual([])
    expect(editsUpdated()).toEqual([])
  })
})
