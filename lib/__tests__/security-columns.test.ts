import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { SecurityEvidence } from '../scoring'
import { deriveDangerousPatternCount, deriveInjectionRisk } from '../security-columns'

/**
 * S43/S46: both columns are derived from the security evidence array, and both
 * have a "the check could not run" case that must not read as a finding.
 */

function evidence(overrides: Partial<SecurityEvidence> & { id: string }): SecurityEvidence {
  return {
    label: overrides.id,
    pass: null,
    detail: '',
    points: 0,
    max_points: 3,
    ...overrides,
  }
}

describe('deriveDangerousPatternCount', () => {
  it('reports null, not a count, when there were no tools to analyze', () => {
    // The check scores 0/3 when it cannot run, so `max_points - points` claimed
    // 3 dangerous patterns for a server whose own evidence says "No tools to
    // analyze". 0 would be equally wrong — it claims a clean scan happened.
    const result = deriveDangerousPatternCount([
      evidence({ id: 'tool-safety', pass: null, points: 0, max_points: 3 }),
    ])
    expect(result).toBeNull()
  })

  it('reports 0 for a scanned server whose tools are clean', () => {
    expect(
      deriveDangerousPatternCount([
        evidence({ id: 'tool-safety', pass: true, points: 3, max_points: 3 }),
      ])
    ).toBe(0)
  })

  it('reports the deducted points for a genuinely unsafe tool', () => {
    expect(
      deriveDangerousPatternCount([
        evidence({ id: 'tool-safety', pass: false, points: 1, max_points: 3 }),
      ])
    ).toBe(2)
  })

  it('reports null when the tool-safety entry is missing entirely', () => {
    expect(deriveDangerousPatternCount([])).toBeNull()
    expect(
      deriveDangerousPatternCount([evidence({ id: 'dep-health', pass: true, points: 3 })])
    ).toBeNull()
  })
})

describe('deriveInjectionRisk', () => {
  it('counts a hidden-instruction payload in a tool description as an injection risk', () => {
    expect(
      deriveInjectionRisk([evidence({ id: 'tool-poisoning', pass: false, points: 0 })])
    ).toBe(true)
  })

  it('counts a failed injection check', () => {
    expect(deriveInjectionRisk([evidence({ id: 'injection', pass: false, points: 0 })])).toBe(true)
  })

  it('does not treat an un-runnable check as a positive finding', () => {
    // `pass === null` means no tools to analyze — evidence of neither risk nor
    // safety, and the column is a non-nullable boolean.
    expect(
      deriveInjectionRisk([
        evidence({ id: 'injection', pass: null, points: 0 }),
        evidence({ id: 'tool-poisoning', pass: null, points: 0 }),
      ])
    ).toBe(false)
  })

  it('stays false when both checks passed', () => {
    expect(
      deriveInjectionRisk([
        evidence({ id: 'injection', pass: true, points: 3 }),
        evidence({ id: 'tool-poisoning', pass: true, points: 3 }),
      ])
    ).toBe(false)
  })

  it('ignores a failed check that is not an injection vector', () => {
    expect(deriveInjectionRisk([evidence({ id: 'tool-safety', pass: false, points: 0 })])).toBe(
      false
    )
  })
})

// ── The MCP security report renders these two columns ───────────────────────

const apiCall = vi.hoisted(() => vi.fn())

vi.mock('@/lib/mcp/api', () => ({
  mcpApiCall: apiCall,
  logTelemetry: () => {},
}))

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[]
}>

/**
 * The report is a closure inside `registerTools`, so it is reached by passing a
 * fake `McpServer` that captures the handlers instead of a real transport.
 * `registerTools` calls nothing on `server` except `registerTool`.
 */
async function renderSecurityReport(row: Record<string, unknown>): Promise<string> {
  const handlers = new Map<string, ToolHandler>()
  const { registerTools } = await import('../mcp/tools')
  registerTools({
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(name, handler)
    },
  } as unknown as McpServer)

  apiCall.mockResolvedValue({ data: row, error: null })
  const result = await handlers.get('get_server_details')!({ slug: 'example', security: true })
  return result.content[0].text
}

const SECURITY_ROW = {
  slug: 'example',
  name: 'Example',
  score_security: 20,
  cve_count: 0,
  dep_health_score: 2,
  dangerous_pattern_count: 1,
  license: 'MIT',
  security_evidence: [],
}

describe('MCP security report — dep_health_score and dangerous_pattern_count', () => {
  beforeEach(() => {
    apiCall.mockReset()
  })

  it('renders dep health against its real 0-3 ceiling, never /100', async () => {
    // `dep_health_score` is the `dep-health` evidence entry's points
    // (refresh-score/route.ts:188), a 0-3 tally — "2/100" read as a near-total
    // dependency failure.
    const text = await renderSecurityReport(SECURITY_ROW)
    expect(text).toContain('- Dep health: 2/3')
    expect(text).not.toContain('/100')
  })

  it('renders "Not analyzed" rather than a number when there were no tools', async () => {
    const text = await renderSecurityReport({ ...SECURITY_ROW, dangerous_pattern_count: null })
    expect(text).toContain('- Dangerous patterns: Not analyzed')
  })

  it('renders the count when the check did run', async () => {
    const text = await renderSecurityReport(SECURITY_ROW)
    // Trailing newline so the match is the WHOLE line — a bare prefix match
    // would also pass for '12'.
    expect(text).toContain('- Dangerous patterns: 1\n')
  })

  it('renders "Not scanned" for a null dep health score', async () => {
    const text = await renderSecurityReport({ ...SECURITY_ROW, dep_health_score: null })
    expect(text).toContain('- Dep health: Not scanned')
  })
})
