/**
 * Route-level regression test for S52: `refresh-score` is ARCHIVE-FORWARD only.
 * GitHub reporting a repo as live must never clear `is_archived` on the catalog
 * row — rows are archived by duplicate merges, broken-link sweeps and admins,
 * none of which GitHub knows about. Same invariant `bots/update-metadata.ts`
 * already follows; `/api/admin/archive` stays the one place that can clear it.
 *
 * Two things are pinned per case, because fixing only the write is a live trap:
 * the metadata UPDATE payload (what lands in Postgres) AND the `isArchived`
 * argument handed to `scanSecurity`/`scoreMaintenance` (what the row is scored
 * as). Leaving the in-memory mirror on `repoMeta.archived` scores an archived
 * row as live and then stamps `score_computed_at`, locking it out of
 * `bots/compute-scores.ts` re-scoring for 30 days.
 *
 * Same shared harness as `refresh-score-advisories.test.ts`, both flags off.
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

/** What GitHub reports for the repo this run. Each case sets `.archived`. */
const repoMeta = vi.hoisted(() => ({
  current: {
    name: 'mcp',
    description: null,
    license: 'MIT',
    owner: 'acme',
    stars: 12,
    language: 'TypeScript',
    topics: [] as string[],
    archived: false,
    lastCommit: '2026-06-01T00:00:00.000Z',
    openIssues: 3,
    homepage: null,
  },
}))

vi.mock('@/lib/github', () => ({
  fetchRepoMetadata: async () => repoMeta.current,
  fetchReadme: async () => null,
}))

/** Positional args the two isArchived-consuming scorers actually saw. */
const scanSecurityArgs = vi.hoisted(() => ({ current: [] as unknown[] }))
const scoreMaintenanceArgs = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock('@/lib/scoring', () => ({
  scanSecurity: async (...args: unknown[]) => {
    scanSecurityArgs.current = args
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
    } satisfies SecurityScanResult
  },
  measureTokenEfficiency: () => ({
    score: 10, total_tool_tokens: 100, estimated_tokens_per_call: 10, grade: 'A',
  }),
  scoreDocumentation: async () => ({
    score: 10, readme_quality: 5, has_setup_instructions: true, has_examples: true,
  }),
  scoreCompatibility: () => ({ score: 10 }),
  scoreMaintenance: (...args: unknown[]) => {
    scoreMaintenanceArgs.current = args
    return { score: 10 }
  },
}))

/**
 * `github_url` set so the metadata branch runs; `npm_package` null so the
 * downloads write does NOT — exactly two `servers` updates per run.
 */
const SERVER_ROW = {
  id: 'srv-1',
  slug: 'example',
  tools: [],
  github_url: 'https://github.com/acme/mcp',
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

// Select the metadata write by SHAPE, never by position: this route issues more
// than one `servers` update and their order is an implementation detail.
const serversUpdates = () => calls.filter(c => c.table === 'servers' && c.op === 'update')
const payloads = () => serversUpdates().map(c => c.args[0] as Record<string, unknown>)
const metadataPayload = () => payloads().find(p => 'health_checked_at' in p)!

/** `isArchived` is positional argument 4 in both scorers (lib/scoring.ts:843, :1151). */
const ARCHIVED_ARG = 4

function setUp(rowArchived: boolean, githubArchived: boolean) {
  harness.queued['servers:single'] = { ...SERVER_ROW, is_archived: rowArchived }
  repoMeta.current = { ...repoMeta.current, archived: githubArchived }
}

describe('POST /api/server/[slug]/refresh-score — archive forward only', () => {
  beforeEach(() => {
    harness.reset()
    authUser.current = { id: 'user-1' }
    scanSecurityArgs.current = []
    scoreMaintenanceArgs.current = []
    harness.queued = {
      'profiles:single': { role: 'admin' },
      'servers:single': { ...SERVER_ROW },
      'security_advisories:await': [],
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never unarchives a row GitHub reports as live', async () => {
    setUp(true, false)

    const res = await postRefresh()
    expect(res.status).toBe(200)
    // Teeth: without this the absence assertion below could pass on an early bail.
    expect(serversUpdates()).toHaveLength(2)

    expect(metadataPayload()).not.toHaveProperty('is_archived')
    expect(scanSecurityArgs.current[ARCHIVED_ARG]).toBe(true)
    expect(scoreMaintenanceArgs.current[ARCHIVED_ARG]).toBe(true)
  })

  it('archives forward when GitHub reports the repo archived', async () => {
    setUp(false, true)

    const res = await postRefresh()
    expect(res.status).toBe(200)
    expect(serversUpdates()).toHaveLength(2)

    expect(metadataPayload().is_archived).toBe(true)
    expect(scanSecurityArgs.current[ARCHIVED_ARG]).toBe(true)
    expect(scoreMaintenanceArgs.current[ARCHIVED_ARG]).toBe(true)
  })

  it('writes no is_archived at all when both sides say live', async () => {
    setUp(false, false)

    const res = await postRefresh()
    expect(res.status).toBe(200)
    expect(serversUpdates()).toHaveLength(2)

    expect(metadataPayload()).not.toHaveProperty('is_archived')
    expect(scanSecurityArgs.current[ARCHIVED_ARG]).toBe(false)
    expect(scoreMaintenanceArgs.current[ARCHIVED_ARG]).toBe(false)
  })

  it('keeps an archived row archived when GitHub agrees', async () => {
    setUp(true, true)

    const res = await postRefresh()
    expect(res.status).toBe(200)
    expect(serversUpdates()).toHaveLength(2)

    expect(metadataPayload().is_archived).toBe(true)
    expect(scanSecurityArgs.current[ARCHIVED_ARG]).toBe(true)
    expect(scoreMaintenanceArgs.current[ARCHIVED_ARG]).toBe(true)
  })
})
