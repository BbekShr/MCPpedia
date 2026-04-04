/**
 * Comprehensive scoring tests for ALL five categories.
 * Ensures scores serve their purpose: differentiating good servers from bad.
 */

import { describe, it, expect } from 'vitest'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
  SCORE_WEIGHTS,
} from '../scoring'
import type { Tool } from '../types'

function tool(name: string, description: string, input_schema?: Record<string, unknown>): Tool {
  return { name, description, input_schema }
}

// ============================================
// EFFICIENCY (0-20)
// ============================================

describe('efficiency scoring', () => {
  it('0 tools = 0 points (no data, not "efficient")', () => {
    const result = measureTokenEfficiency([])
    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
    expect(result.total_tool_tokens).toBe(0)
  })

  it('1 small tool = grade A (20 points)', () => {
    const result = measureTokenEfficiency([tool('ping', 'Ping the server')])
    expect(result.score).toBe(20)
    expect(result.grade).toBe('A')
    expect(result.total_tool_tokens).toBeLessThan(500)
  })

  it('many tools with large schemas = lower grade', () => {
    const bigTools = Array.from({ length: 20 }, (_, i) =>
      tool(`tool_${i}`, 'A'.repeat(200), {
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 10 }, (_, j) => [`param_${j}`, { type: 'string', description: 'B'.repeat(100) }])
        ),
      })
    )
    const result = measureTokenEfficiency(bigTools)
    expect(result.score).toBeLessThan(12) // Should be D or F
    expect(result.total_tool_tokens).toBeGreaterThan(4000)
  })

  it('token estimation is reasonable (~3.5 chars/token)', () => {
    const result = measureTokenEfficiency([tool('test', 'A simple test tool', {
      type: 'object',
      properties: { input: { type: 'string', description: 'The input' } },
    })])
    // ~100 chars of JSON → ~29 tokens
    expect(result.total_tool_tokens).toBeGreaterThan(15)
    expect(result.total_tool_tokens).toBeLessThan(100)
  })

  it('breakdown is sorted by token count descending', () => {
    const result = measureTokenEfficiency([
      tool('small', 'Hi'),
      tool('big', 'A'.repeat(500)),
    ])
    expect(result.tool_breakdown[0].name).toBe('big')
    expect(result.tool_breakdown[1].name).toBe('small')
  })
})

// ============================================
// MAINTENANCE (0-25)
// ============================================

describe('maintenance scoring', () => {
  it('active project with recent commits and stars scores high', () => {
    const result = scoreMaintenance(
      new Date(Date.now() - 3 * 86400000).toISOString(), // 3 days ago
      1500,   // stars
      5000,   // downloads
      20,     // issues
      false,  // not archived
      true    // verified
    )
    expect(result.score).toBeGreaterThanOrEqual(20)
    expect(result.days_since_commit).toBeLessThanOrEqual(7)
  })

  it('abandoned project with no commits scores near zero', () => {
    const result = scoreMaintenance(
      null,   // no commit data
      0,      // no stars
      0,      // no downloads
      0,      // no issues
      false,
      false
    )
    expect(result.score).toBe(0)
  })

  it('archived project gets heavy penalty', () => {
    const result = scoreMaintenance(
      new Date(Date.now() - 30 * 86400000).toISOString(),
      500,
      1000,
      10,
      true, // archived
      false
    )
    // 10 + 3 + 4 - 10 = 7
    expect(result.score).toBeLessThanOrEqual(10)
    expect(result.is_archived).toBe(true)
  })

  it('stale project (6+ months) gets low commit points', () => {
    const result = scoreMaintenance(
      new Date(Date.now() - 200 * 86400000).toISOString(), // 200 days ago
      50,
      50,
      0,
      false,
      false
    )
    expect(result.score).toBeLessThanOrEqual(4) // Only +2 for commit recency
  })

  it('100+ open issues penalty applies', () => {
    const withIssues = scoreMaintenance(
      new Date(Date.now() - 5 * 86400000).toISOString(),
      100, 100, 150, false, false
    )
    const withoutIssues = scoreMaintenance(
      new Date(Date.now() - 5 * 86400000).toISOString(),
      100, 100, 10, false, false
    )
    expect(withoutIssues.score - withIssues.score).toBe(2)
  })

  it('commit recency tiers are correct', () => {
    const recent = scoreMaintenance(new Date(Date.now() - 5 * 86400000).toISOString(), 0, 0, 0, false, false)
    const month = scoreMaintenance(new Date(Date.now() - 20 * 86400000).toISOString(), 0, 0, 0, false, false)
    const quarter = scoreMaintenance(new Date(Date.now() - 60 * 86400000).toISOString(), 0, 0, 0, false, false)
    const old = scoreMaintenance(new Date(Date.now() - 400 * 86400000).toISOString(), 0, 0, 0, false, false)

    expect(recent.score).toBe(12)   // ≤7 days
    expect(month.score).toBe(10)    // ≤30 days
    expect(quarter.score).toBe(7)   // ≤90 days
    expect(old.score).toBe(0)       // >365 days
  })
})

// ============================================
// DOCUMENTATION (0-15)
// ============================================

describe('documentation scoring', () => {
  it('fully documented server scores 15/15', async () => {
    const tools = [
      tool('search', 'Search for items matching a query', { type: 'object', properties: { q: { type: 'string' } } }),
      tool('get', 'Get an item by ID', { type: 'object', properties: { id: { type: 'string' } } }),
    ]
    const readme = `# MCP Server\n## Installation\nnpm install foo\n## Usage\n\`\`\`js\nconst x = 1;\n\`\`\`\n## API\n### search\nSearch items.\n## Examples\nHere's an example.\n## Configuration\nSet API_KEY.\n` + 'Detailed documentation content. '.repeat(100)
    const result = await scoreDocumentation(
      readme,
      'A comprehensive MCP server for searching and retrieving items from a database.',
      'Search and retrieve items',
      tools,
      { 'claude-desktop': { mcpServers: {} } },
      'SearchAPI',
      'https://github.com/example/mcp-server',
      'https://example.com'
    )
    expect(result.score).toBe(15)
    expect(result.readme_quality).toBe('excellent')
  })

  it('empty server scores near zero', async () => {
    const result = await scoreDocumentation(
      null,   // no readme
      null,   // no description
      null,   // no tagline
      [],     // no tools
      {},     // no install configs
      null,   // no API name
      null,   // no github
      null    // no homepage
    )
    expect(result.score).toBe(0)
    expect(result.readme_quality).toBe('none')
  })

  it('tools without descriptions get low tool score', async () => {
    const tools = [
      tool('a', ''),       // no description
      tool('b', 'short'),  // too short (<10)
      tool('c', 'This tool has a proper description'),
    ]
    const result = await scoreDocumentation(null, null, null, tools, {}, null, null, null)
    expect(result.has_tool_documentation).toBe(false)
    expect(result.score).toBeLessThanOrEqual(2)
  })

  it('README quality tiers work correctly', async () => {
    const excellent = await scoreDocumentation('# H1\n## H2\n## H3\n## H4\n## H5\n' + 'x'.repeat(3000), null, null, [], {}, null, null, null)
    const good = await scoreDocumentation('# H1\n## H2\n## H3\n' + 'x'.repeat(1000), null, null, [], {}, null, null, null)
    const basic = await scoreDocumentation('x'.repeat(400), null, null, [], {}, null, null, null)
    const poor = await scoreDocumentation('tiny', null, null, [], {}, null, null, null)

    expect(excellent.readme_quality).toBe('excellent')
    expect(good.readme_quality).toBe('good')
    expect(basic.readme_quality).toBe('basic')
    expect(poor.readme_quality).toBe('poor')
  })
})

// ============================================
// COMPATIBILITY (0-10)
// ============================================

describe('compatibility scoring', () => {
  it('stdio + 4 clients scores 10/10', () => {
    const result = scoreCompatibility(
      ['stdio'],
      ['claude-desktop', 'cursor', 'claude-code', 'windsurf'],
      [tool('test', 'A test')]
    )
    expect(result.score).toBe(10)
  })

  it('both transports + clients can exceed cap', () => {
    const result = scoreCompatibility(
      ['stdio', 'http'],
      ['claude-desktop', 'cursor'],
      [tool('test', 'A test')]
    )
    // stdio 4 + http 4 + multi 2 + 2*2 clients = 14 → capped at 10
    expect(result.score).toBe(10)
  })

  it('no transport data = 0 points', () => {
    const result = scoreCompatibility([], [], [])
    expect(result.score).toBe(0)
    expect(result.supports_stdio).toBe(false)
    expect(result.supports_http).toBe(false)
  })

  it('stdio only with no clients but has tools gets fallback', () => {
    const result = scoreCompatibility(
      ['stdio'],
      [],
      [tool('test', 'A test')]
    )
    // stdio 4 + fallback 3 = 7
    expect(result.score).toBe(7)
  })

  it('http only with no clients = 4', () => {
    const result = scoreCompatibility(['http'], [], [])
    expect(result.score).toBe(4)
  })
})

// ============================================
// SECURITY (0-30) — integration with other checks
// ============================================

describe('security scoring: no-tool servers', () => {
  it('server with 0 tools gets reduced score (no free points)', async () => {
    const result = await scanSecurity(null, null, false, 'MIT', false, false, [])
    // With 0 tools: CVE 15 (no package) + safety 0 + poisoning 0 + injection 0 + stability 0 + dep 1 + license 3 + auth 0 + repo 2 = 21
    // Wait - CVE with no package gives 15 pts? Let me check...
    // checkCVEs with no package: "No package registry to scan" - still returns 15 points
    // That's also questionable but it's the existing behavior
    const safety = result.evidence.find(e => e.id === 'tool-safety')!
    const poisoning = result.evidence.find(e => e.id === 'tool-poisoning')!
    const injection = result.evidence.find(e => e.id === 'injection')!

    const cve = result.evidence.find(e => e.id === 'cve')!
    const depHealth = result.evidence.find(e => e.id === 'dep-health')!

    expect(cve.points).toBe(0)       // No package = can't verify
    expect(safety.points).toBe(0)     // No tools = can't verify
    expect(poisoning.points).toBe(0)  // No tools = can't verify
    expect(injection.points).toBe(0)  // No tools = can't verify
    expect(depHealth.points).toBe(0)  // No package = can't verify
    expect(safety.pass).toBeNull()
  })

  it('server with tools gets full points if clean', async () => {
    const tools = [tool('safe_tool', 'A perfectly safe tool', {
      type: 'object',
      properties: { input: { type: 'string' } },
    })]
    const result = await scanSecurity(null, null, false, 'MIT', false, false, tools)
    const safety = result.evidence.find(e => e.id === 'tool-safety')!
    const poisoning = result.evidence.find(e => e.id === 'tool-poisoning')!
    const injection = result.evidence.find(e => e.id === 'injection')!

    expect(safety.points).toBe(3)
    expect(poisoning.points).toBe(5)
    expect(injection.points).toBe(3)
  })
})

// ============================================
// END-TO-END: score differentiation
// ============================================

describe('score differentiation', () => {
  it('well-maintained server with tools scores much higher than empty server', async () => {
    // Simulate a good server
    const goodTools = [
      tool('search', 'Search for items in the database', { type: 'object', properties: { q: { type: 'string' } } }),
      tool('get', 'Get item by ID', { type: 'object', properties: { id: { type: 'string' } } }),
    ]
    const goodSecurity = await scanSecurity(null, null, true, 'MIT', false, false, goodTools, 'stable')
    const goodEfficiency = measureTokenEfficiency(goodTools)
    const goodMaintenance = scoreMaintenance(new Date(Date.now() - 3 * 86400000).toISOString(), 500, 2000, 10, false, false)
    const goodCompat = scoreCompatibility(['stdio', 'http'], ['claude-desktop', 'cursor'], goodTools)
    const goodDocs = await scoreDocumentation(
      '# Server\n## Install\nnpm i foo\n## Usage\n```js\nfoo()\n```\n## API\n### search\nSearch.\n## Config\nSet KEY.',
      'A great MCP server for searching databases.',
      'Search databases',
      goodTools,
      { 'claude-desktop': {} },
      'SearchAPI',
      'https://github.com/example/good',
      'https://example.com'
    )
    const goodTotal = Math.min(100, goodSecurity.score + goodEfficiency.score + goodDocs.score + goodCompat.score + goodMaintenance.score)

    // Simulate a bad server (no tools, no maintenance, minimal metadata)
    const badSecurity = await scanSecurity(null, null, false, null, false, false, [])
    const badEfficiency = measureTokenEfficiency([])
    const badMaintenance = scoreMaintenance(null, 0, 0, 0, false, false)
    const badCompat = scoreCompatibility(['stdio'], [], [])
    const badDocs = await scoreDocumentation(null, 'A server', null, [], {}, null, null, null)
    const badTotal = Math.min(100, badSecurity.score + badEfficiency.score + badDocs.score + badCompat.score + badMaintenance.score)

    console.log('Good server:', goodTotal, '(sec=' + goodSecurity.score + ' eff=' + goodEfficiency.score + ' doc=' + goodDocs.score + ' cmp=' + goodCompat.score + ' mnt=' + goodMaintenance.score + ')')
    console.log('Bad server:', badTotal, '(sec=' + badSecurity.score + ' eff=' + badEfficiency.score + ' doc=' + badDocs.score + ' cmp=' + badCompat.score + ' mnt=' + badMaintenance.score + ')')

    // The good server should score at LEAST 30 points more
    expect(goodTotal - badTotal).toBeGreaterThanOrEqual(30)
    // Good server should be in the 70-100 range
    expect(goodTotal).toBeGreaterThanOrEqual(70)
    // Bad server should be below 30
    expect(badTotal).toBeLessThanOrEqual(30)
  })
})
