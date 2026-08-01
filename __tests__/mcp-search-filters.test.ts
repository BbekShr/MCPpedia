import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Route-level tests for three fixes on `POST /api/mcp`:
 *
 * - S37: `min_score` is pushed into the `search_servers` RPC so the DB filters
 *   BEFORE it paginates. Filtering in JS after the LIMIT returned an empty
 *   array whenever the top-N relevance hits all scored below the floor.
 * - S39: the action allow-list gate now runs BEFORE the `increment_mcp_usage`
 *   write, so an unauthenticated caller cannot name a usage bucket.
 * - S44: `safeInt` rounds a finite non-integer instead of falling back, so
 *   `min_score: 62.5` reaches the RPC as 63 rather than becoming "no floor".
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  rateLimitIp: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
}))

import { createClient } from '@/lib/supabase/server'
import { POST as mcpPOST } from '@/app/api/mcp/route'

type Row = Record<string, unknown>

function server(slug: string, score: number, extra: Row = {}): Row {
  return {
    slug,
    name: slug,
    tagline: `${slug} tagline`,
    score_total: score,
    score_security: 20,
    categories: ['developer-tools'],
    ...extra,
  }
}

/**
 * The corpus in RELEVANCE order: the five best-ranked matches all score below
 * 70, and six qualifying servers sit further down the ranking. That shape is
 * exactly what the pre-fix code got wrong.
 */
const CORPUS: Row[] = [
  server('low-1', 10),
  server('low-2', 22),
  server('low-3', 31),
  server('low-4', 38),
  server('low-5', 40),
  server('high-1', 95),
  server('high-2', 92),
  server('high-3', 88),
  server('high-4', 85),
  server('high-5', 82),
  server('high-6', 80),
]

let rpc: ReturnType<typeof vi.fn>

/**
 * Models what the SQL actually does, so the test cannot pass by construction:
 * `min_score_filter` is part of the WHERE clause
 * (supabase/migrations/20260719120000_search_servers_filters.sql:34) and
 * `limit page_size` / `offset page_offset` are applied afterwards (:45-46).
 * Keep this ordering in step with that function — a future SQL change that
 * moves the filter makes these tests stale.
 */
function searchServersFake(args: Record<string, unknown>): Row[] {
  const minScore = args.min_score_filter as number | null
  const category = args.category_filter as string | null
  const filtered = CORPUS.filter(
    r =>
      (minScore == null || (r.score_total as number) >= minScore) &&
      (category == null || (r.categories as string[]).includes(category))
  )
  return filtered.slice(
    (args.page_offset as number) ?? 0,
    ((args.page_offset as number) ?? 0) + (args.page_size as number)
  )
}

function mockClient() {
  rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'search_servers') return { data: searchServersFake(args), error: null }
    return { data: null, error: null }
  })

  // The route falls through to a plain `.from('servers')` query whenever the
  // RPC returns nothing, so the client needs a chainable builder even in cases
  // that never expect to reach it.
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'contains', 'gte', 'or']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)

  vi.mocked(createClient).mockResolvedValue({
    rpc,
    from: () => builder,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function post(body: unknown) {
  return mcpPOST(
    new Request('https://mcppedia.org/api/mcp', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )
}

/** The rpc spy serves two RPCs — never assert on it unfiltered. */
const callsTo = (name: string) => rpc.mock.calls.filter(c => c[0] === name)
const searchArgs = () => callsTo('search_servers')[0][1] as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient()
})

describe('POST /api/mcp action:"search" — min_score (S37/S44)', () => {
  it('fills the page with qualifying servers even when the top hits all score below the floor', async () => {
    const res = await post({
      action: 'search',
      params: { query: 'github', min_score: 70, limit: 5 },
    })
    const { data } = await res.json()

    expect(data).toHaveLength(5)
    for (const row of data) {
      expect(row.score_total).toBeGreaterThanOrEqual(70)
    }
  })

  it('forwards min_score, category and limit into the RPC rather than filtering after', async () => {
    await post({
      action: 'search',
      params: { query: 'github', min_score: 70, category: 'developer-tools', limit: 5 },
    })

    expect(searchArgs()).toMatchObject({
      min_score_filter: 70,
      category_filter: 'developer-tools',
      page_size: 5,
      page_offset: 0,
    })
  })

  it('rounds a fractional min_score into a real floor instead of dropping it', async () => {
    const res = await post({
      action: 'search',
      params: { query: 'github', min_score: 62.5, limit: 5 },
    })
    const { data } = await res.json()

    expect(searchArgs().min_score_filter).toBe(63)
    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      expect(row.score_total).toBeGreaterThanOrEqual(63)
    }
  })

  it('treats min_score 0 as no floor at all', async () => {
    await post({ action: 'search', params: { query: 'github', min_score: 0, limit: 5 } })
    expect(searchArgs().min_score_filter).toBeNull()
  })

  it('passes no floor when min_score is absent', async () => {
    await post({ action: 'search', params: { query: 'github', limit: 5 } })
    expect(searchArgs().min_score_filter).toBeNull()
  })
})

describe('POST /api/mcp — unknown action is rejected before usage is counted (S39)', () => {
  it('rejects an unknown action with 400 and counts no usage', async () => {
    const res = await post({ action: 'wat', params: {} })

    expect(res.status).toBe(400)
    expect(callsTo('increment_mcp_usage')).toHaveLength(0)
  })

  // The route has no length cap — a 5000-char action is just another unknown
  // action hitting the same `isKnownAction` branch, which is what this pins.
  it('rejects a very long unknown action string without writing a usage row', async () => {
    const res = await post({ action: 'x'.repeat(5000), params: {} })

    expect(res.status).toBe(400)
    expect(callsTo('increment_mcp_usage')).toHaveLength(0)
  })

  it('still counts usage for a known action', async () => {
    // Teeth: the two assertions above would hold if the increment had simply
    // been deleted rather than moved behind the allow-list.
    await post({ action: 'search', params: { query: 'github' } })

    expect(callsTo('increment_mcp_usage')).toHaveLength(1)
    expect(callsTo('increment_mcp_usage')[0][1]).toMatchObject({ p_action: 'search' })
  })
})
