import { describe, it, expect, vi, beforeEach } from 'vitest'

// `search_servers` is declared `returns setof servers`, so the RPC hands the
// route EVERY column of the table. These tests pin the route-layer projection
// (S30): if a new column is added to `servers` it must NOT reach the public
// response unless it is also added to the allow-list.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  rateLimitIp: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
}))

import { createClient } from '@/lib/supabase/server'
import { GET as searchGET } from '@/app/api/search/route'
import { POST as mcpPOST } from '@/app/api/mcp/route'
import { PUBLIC_CARD_FIELD_LIST } from '@/lib/constants'

// Fields the public API must never expose — auth user ids, scan internals,
// registry bookkeeping, the fts vector and the heavy tool payloads.
const FORBIDDEN = [
  'submitted_by', 'claimed_by', 'fts',
  'security_issues', 'security_verified', 'data_quality',
  'registry_id', 'registry_synced_at', 'registry_verified',
  'dangerous_pattern_count', 'dep_health_score',
  'tools', 'resources', 'prompts',
]

// A whole `servers` row as the RPC returns it: allow-listed columns plus the
// internal ones that used to be serialized verbatim.
const FAT_ROW: Record<string, unknown> = {
  id: 'srv-1',
  slug: 'github-mcp',
  name: 'GitHub MCP',
  tagline: 'Talk to GitHub',
  homepage_url: 'https://example.com',
  author_github: 'octocat',
  author_type: 'community',
  transport: ['stdio'],
  categories: ['developer-tools'],
  install_configs: { claude: {} },
  github_stars: 12,
  github_last_commit: '2026-07-01T00:00:00Z',
  npm_weekly_downloads: 3,
  health_status: 'active',
  cve_count: 0,
  score_total: 71,
  score_security: 20,
  score_maintenance: 15,
  score_efficiency: 10,
  score_documentation: 12,
  score_compatibility: 14,
  token_efficiency_grade: 'B',
  tool_count: 4,
  submitted_by: '00000000-0000-0000-0000-000000000001',
  claimed_by: '00000000-0000-0000-0000-000000000002',
  security_issues: ['internal'],
  security_verified: true,
  data_quality: 0.9,
  registry_id: 'reg-1',
  registry_synced_at: '2026-07-01T00:00:00Z',
  registry_verified: true,
  dangerous_pattern_count: 2,
  dep_health_score: 55,
  fts: "'github':1",
  tools: [{ name: 'create_issue', inputSchema: {} }],
  resources: [{ uri: 'x' }],
  prompts: [{ name: 'p' }],
}

function mockRpcClient(rows: Record<string, unknown>[]) {
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/search (RPC branch)', () => {
  it('returns only allow-listed fields', async () => {
    mockRpcClient([FAT_ROW])
    const res = await searchGET(new Request('https://mcppedia.org/api/search?q=github'))
    const body = await res.json()

    expect(body.servers).toHaveLength(1)
    const keys = Object.keys(body.servers[0])
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(PUBLIC_CARD_FIELD_LIST as readonly string[]).toContain(key)
    }
  })

  it('does not leak internal columns', async () => {
    mockRpcClient([FAT_ROW])
    const res = await searchGET(new Request('https://mcppedia.org/api/search?q=github'))
    const body = await res.json()

    for (const field of FORBIDDEN) {
      expect(body.servers[0]).not.toHaveProperty(field)
    }
  })

  it('keeps the fields the search dropdowns render', async () => {
    mockRpcClient([FAT_ROW])
    const res = await searchGET(new Request('https://mcppedia.org/api/search?q=github'))
    const body = await res.json()

    expect(body.servers[0]).toMatchObject({
      slug: 'github-mcp',
      name: 'GitHub MCP',
      tagline: 'Talk to GitHub',
      score_total: 71,
    })
  })
})

describe('POST /api/mcp action:"search" (RPC branch)', () => {
  async function callSearch() {
    mockRpcClient([FAT_ROW])
    const res = await mcpPOST(
      new Request('https://mcppedia.org/api/mcp', {
        method: 'POST',
        body: JSON.stringify({ action: 'search', params: { query: 'github' } }),
      })
    )
    return (await res.json()).data
  }

  it('does not leak internal columns', async () => {
    const data = await callSearch()
    expect(data).toHaveLength(1)
    for (const field of FORBIDDEN) {
      expect(data[0]).not.toHaveProperty(field)
    }
  })

  it('keeps the summary fields MCP clients render', async () => {
    const data = await callSearch()
    expect(data[0]).toMatchObject({
      slug: 'github-mcp',
      name: 'GitHub MCP',
      score_total: 71,
      score_security: 20,
    })
  })
})
