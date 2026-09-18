/**
 * Route-level test for S99: /api/submit only checked for duplicates among LIVE
 * rows (`.eq('is_archived', false)`), so resubmitting a server that had been
 * archived — by the dedup bot or a maintainer — sailed past the check and
 * created a second listing for the same repository. The route now scans
 * archived rows too and answers `duplicate_archived` when the only match is
 * archived, while the live-duplicate path stays byte-identical.
 *
 * `keyByWriteOp` is required: the candidate `.or().limit()` read and the
 * post-insert admin `update().eq()` both terminate in a plain `await` and
 * would otherwise collide on `servers:await`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouteSupabaseHarness } from './helpers/route-supabase-stub'

const harness = createRouteSupabaseHarness({ keyByWriteOp: true })
const { calls, authUser } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: harness.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: harness.createAdminClient }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitUser: async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 1000 }),
}))
// The real module calls next/cache and reads data/comparison-pairs.json off disk.
vi.mock('@/lib/revalidate', () => ({
  revalidateServer: () => {},
  revalidateProfile: () => {},
}))
vi.mock('@/lib/github', () => ({
  fetchRepoMetadata: async () => null,
  fetchReadme: async () => null,
}))
vi.mock('@/lib/scoring', () => ({
  scanSecurity: async () => ({
    score: 20,
    scan_status: 'success',
    cve_count: 0,
    evidence: [],
    advisories: [],
    has_authentication: false,
    has_tool_poisoning: false,
    tool_poisoning_flags: [],
    tool_definition_hash: null,
  }),
  measureTokenEfficiency: () => ({
    score: 10,
    total_tool_tokens: 0,
    estimated_tokens_per_call: 0,
    grade: 'A',
  }),
  scoreDocumentation: async () => ({
    score: 10,
    readme_quality: 0,
    has_setup_instructions: false,
    has_examples: false,
  }),
  scoreCompatibility: () => ({ score: 10 }),
  scoreMaintenance: () => ({ score: 10 }),
}))
vi.mock('@/lib/advisories', () => ({ reconcileAdvisories: async () => {} }))

const MONOREPO_URL = 'https://github.com/modelcontextprotocol/servers'

async function postSubmit(overrides: Record<string, unknown> = {}) {
  const { POST } = await import('@/app/api/submit/route')
  return POST(new Request('http://localhost/api/submit', {
    method: 'POST',
    body: JSON.stringify({
      github_url: 'https://github.com/acme/thing',
      name: 'My Server',
      transport: ['stdio'],
      categories: [],
      ...overrides,
    }),
  }))
}

const inserts = () => calls.filter(c => c.table === 'servers' && c.op === 'insert')

describe('POST /api/submit — archived duplicates', () => {
  beforeEach(() => {
    harness.reset()
    authUser.current = { id: 'user-1' }
    // `servers:maybeSingle` is deliberately UNQUEUED so the slug guard misses
    // and every case reaches the candidate scan.
    harness.queued = {
      'servers:insert': { id: 'srv-1', slug: 'my-server', tools: [], transport: ['stdio'] },
      'servers:update': [],
      'profiles:single': { username: 'alice' },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Positive control: without it, every rejection case below could pass on an
  // early 400/401 instead of on the branch it means to exercise.
  it('accepts a submission with no matching candidate row', async () => {
    harness.queued['servers:await'] = []

    const res = await postSubmit()
    expect(res.status).toBe(201)
    expect(inserts()).toHaveLength(1)
  })

  it('rejects with duplicate_archived when the only match is archived', async () => {
    harness.queued['servers:await'] = [{
      slug: 'old-server',
      name: 'Old Server',
      github_url: 'https://github.com/acme/thing',
      npm_package: null,
      pip_package: null,
      is_archived: true,
    }]

    const res = await postSubmit()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('duplicate_archived')
    expect(body.existing).toEqual({
      slug: 'old-server',
      name: 'Old Server',
      url: '/s/old-server',
      archived: true,
    })
    expect(body.message).toMatch(/archiv/i)
    expect(body.message).not.toMatch(/merged into/i)
    expect(inserts()).toHaveLength(0)
  })

  it('prefers the LIVE match even when an archived match is returned first', async () => {
    harness.queued['servers:await'] = [
      {
        slug: 'old-server',
        name: 'Old Server',
        github_url: 'https://github.com/acme/thing',
        npm_package: null,
        pip_package: null,
        is_archived: true,
      },
      {
        slug: 'live-server',
        name: 'Live Server',
        github_url: 'https://github.com/acme/thing',
        npm_package: null,
        pip_package: null,
        is_archived: false,
      },
    ]

    const res = await postSubmit()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'duplicate',
      message: 'This server is already on MCPpedia. Edit or claim the existing entry instead.',
      existing: { slug: 'live-server', name: 'Live Server', url: '/s/live-server' },
    })
    expect(inserts()).toHaveLength(0)
  })

  // `is_archived` is nullable and NULL means live everywhere in this repo, so
  // the partition must test `!is_archived`, never `=== false`.
  it('treats a null is_archived as LIVE', async () => {
    harness.queued['servers:await'] = [{
      slug: 'live-server',
      name: 'Live Server',
      github_url: 'https://github.com/acme/thing',
      npm_package: null,
      pip_package: null,
      is_archived: null,
    }]

    const res = await postSubmit()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('duplicate')
    expect(body.existing.archived).toBeUndefined()
    expect(inserts()).toHaveLength(0)
  })

  it('allows a submission whose only archived match is a monorepo URL', async () => {
    harness.queued['servers:await'] = [{
      slug: 'mono-old',
      name: 'Mono Old',
      github_url: MONOREPO_URL,
      npm_package: null,
      pip_package: null,
      is_archived: true,
    }]

    const res = await postSubmit({ github_url: MONOREPO_URL })
    expect(res.status).toBe(201)
    expect(inserts()).toHaveLength(1)
  })

  it('still blocks a LIVE monorepo URL match', async () => {
    harness.queued['servers:await'] = [{
      slug: 'mono-live',
      name: 'Mono Live',
      github_url: MONOREPO_URL,
      npm_package: null,
      pip_package: null,
      is_archived: false,
    }]

    const res = await postSubmit({ github_url: MONOREPO_URL })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('duplicate')
    expect(inserts()).toHaveLength(0)
  })

  it('blocks an archived monorepo row that also matches on package name', async () => {
    harness.queued['servers:await'] = [{
      slug: 'mono-old',
      name: 'Mono Old',
      github_url: MONOREPO_URL,
      npm_package: 'thing-mcp',
      pip_package: null,
      is_archived: true,
    }]

    const res = await postSubmit({ github_url: MONOREPO_URL, npm_package: 'thing-mcp' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('duplicate_archived')
    expect(inserts()).toHaveLength(0)
  })

  // The stub executes no filtering or ordering, so only a shape assertion can
  // catch a future edit that restores the archived filter (re-opening S99) or
  // adds an ORDER BY — which on these unindexed columns would forfeit LIMIT's
  // early exit AND systematically starve one partition of the window.
  it('queries candidates unfiltered by is_archived and unordered', async () => {
    harness.queued['servers:await'] = []
    await postSubmit()

    const serverCalls = calls.filter(c => c.table === 'servers')
    expect(serverCalls).not.toContainEqual({ table: 'servers', op: 'eq', args: ['is_archived', false] })
    expect(serverCalls.some(c => c.op === 'order')).toBe(false)

    const limitCall = serverCalls.find(c => c.op === 'limit')
    expect(limitCall).toBeDefined()
    expect(limitCall!.args[0]).toBe(200)
  })

  it('refuses with 503 when the candidate read errors, rather than inserting', async () => {
    harness.queuedErrors['servers:await'] = {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    }

    const res = await postSubmit()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('duplicate_check_unavailable')
    expect(inserts()).toHaveLength(0)
  })

  // A full window can't prove uniqueness — the rows we'd have matched may be
  // the ones LIMIT truncated away.
  it('refuses with 503 when the candidate window comes back saturated', async () => {
    harness.queued['servers:await'] = Array.from({ length: 200 }, (_, i) => ({
      slug: `thing-${i}`,
      name: `Thing ${i}`,
      github_url: `https://github.com/acme/thing-${i}`,
      npm_package: null,
      pip_package: null,
      is_archived: false,
    }))

    const res = await postSubmit()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('duplicate_check_unavailable')
    expect(inserts()).toHaveLength(0)
  })

  // A monorepo URL is shared by design, so its window always saturates — the
  // guard must not turn that into a permanent block.
  it('still accepts a saturated monorepo submission with no package', async () => {
    harness.queued['servers:await'] = Array.from({ length: 200 }, (_, i) => ({
      slug: `mono-${i}`,
      name: `Mono ${i}`,
      github_url: `https://github.com/acme/mono-${i}`,
      npm_package: null,
      pip_package: null,
      is_archived: false,
    }))

    const res = await postSubmit({ github_url: MONOREPO_URL })
    expect(res.status).toBe(201)
    expect(inserts()).toHaveLength(1)
  })
})
