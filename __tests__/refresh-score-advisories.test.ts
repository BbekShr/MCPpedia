/**
 * Route-level regression test for S51: a refresh-score run whose scan reports NO
 * advisories must CLOSE the server's open advisory rows. The old code guarded
 * the advisory block on `advisories.length > 0`, so the empty case — a package
 * cleared or an OSV entry withdrawn — left the row open forever.
 *
 * The stub is deliberately local to this file: this is the repo's first
 * route-level write test and there is no second consumer to share a harness
 * with yet.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SecurityScanResult, Advisory } from '@/lib/scoring'

type Call = { table: string; op: string; args: unknown[] }

const calls: Call[] = []
/** Rows the awaited reads resolve to, keyed by `${table}:${single|await}`. */
let queued: Record<string, unknown> = {}

/**
 * A PostgREST query builder is BOTH chainable and thenable — this handler runs
 * `select().eq().single()` and `select().eq().eq()` — so every method returns
 * the builder and the builder itself resolves the queued result.
 *
 * Only the BUILDER is thenable, never the client: `await createClient()` would
 * otherwise adopt a thenable client and resolve to the query result instead.
 */
function makeBuilder(table: string) {
  const builder = {
    _record(op: string, args: unknown[]) {
      calls.push({ table, op, args })
      return builder
    },
    select(...args: unknown[]) { return builder._record('select', args) },
    update(...args: unknown[]) { return builder._record('update', args) },
    upsert(...args: unknown[]) { return builder._record('upsert', args) },
    eq(...args: unknown[]) { return builder._record('eq', args) },
    in(...args: unknown[]) { return builder._record('in', args) },
    single() { return resolveFor(`${table}:single`) },
    then(resolve: (value: unknown) => unknown) {
      return resolveFor(`${table}:await`).then(resolve)
    },
  }
  return builder
}

function resolveFor(key: string) {
  return Promise.resolve({ data: key in queued ? queued[key] : [], error: null })
}

function makeStub() {
  return {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
  } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeStub() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeStub() }))
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

describe('POST /api/server/[slug]/refresh-score — advisory reconciliation', () => {
  beforeEach(() => {
    calls.length = 0
    queued = {
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
  })
})
