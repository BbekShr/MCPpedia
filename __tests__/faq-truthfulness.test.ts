import { describe, it, expect } from 'vitest'
import { buildServerFAQs } from '@/components/ServerFAQ'
import { generateConfig } from '@/components/server/InstallMatrix'
import type { Server } from '@/lib/types'

// Issue #68: the auto-generated FAQ and install block asserted things that are
// false for hosted/remote servers (e.g. `datamcp` — has_authentication: false
// but requires_api_key: true, and no local install path at all), and those
// false claims ship as Google-indexed FAQPage JSON-LD
// (app/s/[slug]/page.tsx). These tests pin the corrected, non-fabricating
// behavior.

/** A fully-populated Server so tests only need to override the fields they care about. */
function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: 'id-1',
    slug: 'test-server',
    name: 'Test Server',
    tagline: null,
    description: null,
    github_url: 'https://github.com/example/test-server',
    npm_package: null,
    pip_package: null,
    remote_url: null,
    homepage_url: null,
    license: 'MIT',
    author_name: null,
    author_github: null,
    author_type: 'unknown',
    transport: ['stdio'],
    compatible_clients: [],
    install_configs: {},
    tools: [],
    tool_count: 0,
    resources: [],
    prompts: [],
    api_name: null,
    api_pricing: 'free',
    api_rate_limits: null,
    requires_api_key: false,
    github_stars: 0,
    github_last_commit: null,
    github_open_issues: 0,
    npm_weekly_downloads: 0,
    is_archived: false,
    health_status: 'unknown',
    health_checked_at: null,
    categories: [],
    tags: [],
    source: 'import',
    submitted_by: null,
    verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    score_total: 0,
    score_security: 0,
    score_maintenance: 0,
    score_documentation: 0,
    score_compatibility: 0,
    score_efficiency: 0,
    score_computed_at: null,
    has_authentication: false,
    security_issues: [],
    security_evidence: [],
    cve_count: 0,
    last_security_scan: null,
    security_scan_status: 'pending',
    security_verified: false,
    has_code_execution: false,
    has_injection_risk: false,
    dangerous_pattern_count: 0,
    dep_health_score: null,
    dependency_count: null,
    has_tool_poisoning: false,
    tool_poisoning_flags: [],
    tool_definition_hash: null,
    estimated_tokens_per_call: 0,
    total_tool_tokens: 0,
    token_efficiency_grade: 'unknown',
    doc_readme_quality: null,
    doc_has_setup: false,
    doc_has_examples: false,
    doc_tool_schema_ratio: null,
    registry_id: null,
    registry_synced_at: null,
    registry_verified: false,
    data_quality: 0,
    env_instructions: {},
    prerequisites: [],
    last_health_check_status: null,
    last_health_check_at: null,
    health_check_uptime: 0,
    claimed_by: null,
    publisher_verified: false,
    review_count: 0,
    review_avg: 0,
    community_verification_count: 0,
    community_verified: false,
    ...overrides,
  }
}

function safetyAnswer(server: Server): string {
  const faq = buildServerFAQs(server).find(f => f.question.startsWith('Is '))
  if (!faq) throw new Error('safety FAQ was not generated')
  return faq.answer
}

function installAnswer(server: Server): string {
  const faq = buildServerFAQs(server).find(f => f.question.startsWith('How do I install'))
  if (!faq) throw new Error('install FAQ was not generated')
  return faq.answer
}

describe('buildServerFAQs — authentication claim (issue #68)', () => {
  it('does not claim "does not require authentication" for a server gated by an API key', () => {
    const server = makeServer({ has_authentication: false, requires_api_key: true })
    expect(safetyAnswer(server)).not.toContain('does not require authentication')
  })

  it('makes no confident claim either way when neither flag is set', () => {
    const server = makeServer({ has_authentication: false, requires_api_key: false })
    const answer = safetyAnswer(server)
    expect(answer).not.toContain('does not require authentication')
    expect(answer).not.toContain('It requires authentication')
  })

  it('still asserts the positive claim when has_authentication is true (regression guard)', () => {
    const server = makeServer({ has_authentication: true, requires_api_key: false })
    expect(safetyAnswer(server)).toContain('It requires authentication to connect')
  })

  it('also asserts the positive claim when only requires_api_key is true', () => {
    const server = makeServer({ has_authentication: false, requires_api_key: true })
    expect(safetyAnswer(server)).toContain('It requires authentication to connect')
  })
})

describe('buildServerFAQs — install claim (issue #68)', () => {
  it('does not claim a remote-only server can be installed by cloning its repo', () => {
    const server = makeServer({
      npm_package: null,
      pip_package: null,
      remote_url: 'https://api.example.com/mcp',
      transport: ['http'],
    })
    expect(installAnswer(server)).not.toContain('can be installed by cloning its GitHub repository')
  })

  it('describes a remote-only server as a hosted service configured via its endpoint', () => {
    const server = makeServer({
      npm_package: null,
      pip_package: null,
      remote_url: 'https://api.example.com/mcp',
      transport: ['http'],
    })
    const answer = installAnswer(server)
    expect(answer).toContain('hosted remote')
    expect(answer).toContain('https://api.example.com/mcp')
  })

  it('keeps the clone-the-repo answer for a genuinely local server with no package', () => {
    const server = makeServer({ npm_package: null, pip_package: null, remote_url: null, transport: ['stdio'] })
    expect(installAnswer(server)).toContain('can be installed by cloning its GitHub repository')
  })

  it('keeps the npm install answer for a locally-runnable server', () => {
    const server = makeServer({ npm_package: 'example-mcp', transport: ['stdio'] })
    expect(installAnswer(server)).toContain('npx example-mcp')
  })
})

describe('generateConfig — remote vs local (issue #68)', () => {
  const base = {
    name: 'Test Server',
    npm_package: null as string | null,
    pip_package: null as string | null,
    requires_api_key: false,
    install_configs: {},
    transport: [] as string[],
    remote_url: null as string | null,
  }

  it('produces a url-based config for a remote-only server, not the <see-readme> stub', () => {
    const { config } = generateConfig('claude-desktop', {
      ...base,
      remote_url: 'https://api.example.com/mcp',
      transport: ['http'],
    })
    expect(JSON.stringify(config)).not.toContain('<see-readme>')
    expect(JSON.stringify(config)).toContain('https://api.example.com/mcp')
  })

  it('falls back to the <see-readme> stdio stub for a genuinely undocumented local server (regression guard)', () => {
    const { config } = generateConfig('claude-desktop', base)
    expect(JSON.stringify(config)).toContain('<see-readme>')
  })

  it('does not fabricate a stdio command in the Claude Code CLI branch for a remote server', () => {
    const { config } = generateConfig('claude-code', {
      ...base,
      remote_url: 'https://api.example.com/mcp',
      transport: ['http'],
    })
    expect(config).not.toContain('-- <command> <args>')
    expect(config).toContain('https://api.example.com/mcp')
  })
})
