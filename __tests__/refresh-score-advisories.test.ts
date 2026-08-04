/**
 * Route-level regression test for S51: a refresh-score run whose scan reports NO
 * advisories must CLOSE the server's open advisory rows. The old code guarded
 * the advisory block on `advisories.length > 0`, so the empty case — a package
 * cleared or an OSV entry withdrawn — left the row open forever.
 *
 * The stub is the shared `__tests__/helpers/route-supabase-stub` harness. This
 * suite keeps both flags off: it neither distinguishes the two clients nor keys
 * resolves by write verb, so a recorded call is `{ table, op, args }` and the
 * `security_advisories` read resolves under `:await`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SecurityScanResult, Advisory } from '@/lib/scoring'
import { createRouteSupabaseHarness } from './helpers/route-supabase-stub'

const harness = createRouteSupabaseHarness()
const { calls, authUser } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: harness.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: harness.createAdminClient }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitUser: async () => ({ allowed: true, remaining: 29, resetAt: Date.now() + 1000 }),
}))
vi.mock('@/lib/github', () => ({
  fetchRepoMetadata: async () => null,
  fetchReadme: async () => null,
}))

const scanResult = vi.hoisted(() => ({ current: null as SecurityScanResult | null }))

vi.mock('@/lib/scoring', () => ({
  scanSecurity: async () => scanResult.current,
  measureTokenEfficiency: () => ({
    score: 10, total_tool_tokens: 100, estimated_tokens_per_call: 10, grade: 'A',
  }),
  scoreDocumentation: async () => ({
    score: 10, readme_quality: 5, has_setup_instructions: true, has_examples: true,
  }),
  scoreCompatibility: () => ({ score: 10 }),
  scoreMaintenance: () => ({ score: 10 }),
}))

function makeScan(overrides: Partial<SecurityScanResult>): SecurityScanResult {
  return {
    score: 20,
    evidence: [],
    cve_count: 0,
    advisories: [] as Advisory[],
    has_authentication: false,
    scan_status: 'success',
    has_tool_poisoning: false,
    tool_poisoning_flags: [],
    tool_definition_hash: null,
    ...overrides,
  }
}

/** github_url/npm_package null so the metadata and downloads branches are skipped. */
const SERVER_ROW = {
  id: 'srv-1',
  slug: 'example',
  tools: [],
  github_url: null,
  npm_package: null,
  pip_package: null,
  license: 'MIT',
  is_archived: false,
  verified: false,
  security_verified: false,
  has_authentication: false,
  tool_definition_hash: null,
  score_security: 20,
  last_security_scan: '2026-07-01T00:00:00.000Z',
}

async function postRefresh() {
  const { POST } = await import('@/app/api/server/[slug]/refresh-score/route')
  return POST(new Request('http://localhost/api/server/example/refresh-score', { method: 'POST' }), {
    params: Promise.resolve({ slug: 'example' }),
  })
}

function advisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    cve_id: 'CVE-2026-1',
    severity: 'high',
    cvss_score: 7.5,
    title: 'Example advisory',
    description: 'desc',
    affected_versions: '<1.2.3',
    fixed_version: '1.2.3',
    source_url: 'https://osv.dev/GHSA-xxxx',
    status: 'open',
    published_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** The score write. Its presence proves the handler ran past the auth gates. */
const serversUpdated = () => calls.filter(c => c.table === 'servers' && c.op === 'update')

describe('POST /api/server/[slug]/refresh-score — advisory reconciliation', () => {
  beforeEach(() => {
    harness.reset()
    authUser.current = { id: 'user-1' }
    harness.queued = {
      'profiles:single': { role: 'admin' },
      'servers:single': { ...SERVER_ROW },
      // The open-advisory read the reconciler performs after its upserts.
      'security_advisories:await': [{ id: 'adv-1', cve_id: 'CVE-OLD' }],
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes a stale open advisory when a successful scan reports none', async () => {
    scanResult.current = makeScan({ scan_status: 'success', advisories: [] })

    const res = await postRefresh()
    expect(res.status).toBe(200)

    expect(calls).toContainEqual({
      table: 'security_advisories',
      op: 'update',
      args: [{ status: 'fixed' }],
    })
    expect(calls).toContainEqual({
      table: 'security_advisories',
      op: 'in',
      args: ['id', ['adv-1']],
    })
  })

  it('closes nothing when the OSV scan failed', async () => {
    scanResult.current = makeScan({ scan_status: 'failed', advisories: [] })

    const res = await postRefresh()
    expect(res.status).toBe(200)

    expect(calls.filter(c => c.table === 'security_advisories')).toEqual([])
    // Teeth: without this the assertion above would pass even if the
    // reconcileAdvisories call were deleted from the route entirely.
    expect(serversUpdated()).toHaveLength(1)
  })

  it('touches the advisory table at ALL on a failed scan that carries advisories', async () => {
    // A dual-package server where one OSV query failed and the other succeeded
    // reports 'failed' WITH a populated array (lib/scoring.ts:853, :315-316).
    // The upsert writes `adv.status`, so running it here could itself close a
    // row — hence not one call, not even an upsert.
    scanResult.current = makeScan({ scan_status: 'failed', advisories: [advisory()] })

    const res = await postRefresh()
    expect(res.status).toBe(200)

    expect(calls.filter(c => c.table === 'security_advisories')).toEqual([])
    expect(serversUpdated()).toHaveLength(1)
  })

  it("closes nothing on a 'pending' scan — a maintainer can null both packages", async () => {
    scanResult.current = makeScan({ scan_status: 'pending', advisories: [] })

    const res = await postRefresh()
    expect(res.status).toBe(200)

    expect(calls.filter(c => c.table === 'security_advisories' && c.op === 'update')).toEqual([])
    expect(serversUpdated()).toHaveLength(1)
  })

  // S34: the "never lowers cve_count" clause lives in the conditional spread at
  // refresh-score/route.ts:176-182, not in mergeScoresOnOsvFailure — the helper
  // only reports `osv_failed`. SERVER_ROW is a trusted prior (score_security 20
  // with last_security_scan set), so a failed scan must leave both the
  // CVE-derived columns and the security component alone.
  it('omits the CVE-derived columns and keeps the prior component on a failed scan', async () => {
    scanResult.current = makeScan({ scan_status: 'failed', score: 30, cve_count: 0 })

    const res = await postRefresh()
    expect(res.status).toBe(200)

    const [update] = serversUpdated()
    // Teeth: an absence assertion is vacuous if the handler bailed early.
    expect(serversUpdated()).toHaveLength(1)

    const payload = update.args[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('cve_count')
    expect(payload).not.toHaveProperty('security_evidence')
    expect(payload.score_security).toBe(20)
    // The other four components are mocked at 10 each, so the total must carry
    // the PRESERVED 20, not the fresh 30 — 60, never the inflated 70 that a
    // naive local sum of this run's components would produce.
    expect(payload.score_total).toBe(60)

    // S34 also requires the route to REPORT the failure rather than silently
    // returning the inflated score, so the caller can tell a preserved
    // component from a fresh verdict.
    await expect(res.json()).resolves.toMatchObject({
      security_scan: 'failed',
      score_security: 20,
      score_total: 60,
    })
  })

  it('writes the CVE-derived columns and the fresh component on a successful scan', async () => {
    scanResult.current = makeScan({ scan_status: 'success', score: 30, cve_count: 4 })

    const res = await postRefresh()
    expect(res.status).toBe(200)
    expect(serversUpdated()).toHaveLength(1)

    const payload = serversUpdated()[0].args[0] as Record<string, unknown>
    expect(payload.cve_count).toBe(4)
    expect(payload).toHaveProperty('security_evidence')
    expect(payload.score_security).toBe(30)
    // Same four 10-point components, this time summed with the FRESH 30.
    expect(payload.score_total).toBe(70)
  })

  it('rejects a contributor with 403 and never touches the advisory table', async () => {
    harness.queued['profiles:single'] = { role: 'contributor' }
    scanResult.current = makeScan({ scan_status: 'success', advisories: [] })

    const res = await postRefresh()
    expect(res.status).toBe(403)
    expect(calls.filter(c => c.table === 'security_advisories')).toEqual([])
    expect(serversUpdated()).toHaveLength(0)
  })

  it('rejects an anonymous caller with 401 and never touches the advisory table', async () => {
    authUser.current = null
    scanResult.current = makeScan({ scan_status: 'success', advisories: [] })

    const res = await postRefresh()
    expect(res.status).toBe(401)
    expect(calls.filter(c => c.table === 'security_advisories')).toEqual([])
    expect(serversUpdated()).toHaveLength(0)
  })
})
