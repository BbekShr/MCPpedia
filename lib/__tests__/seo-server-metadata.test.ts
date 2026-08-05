import { describe, it, expect } from 'vitest'
import {
  buildServerTitle,
  buildServerDescription,
  SERVER_TITLE_MAX,
  SERVER_DESCRIPTION_MAX,
} from '../seo'

describe('buildServerTitle', () => {
  it('normalizes the name and drops the volatile score', () => {
    const title = buildServerTitle({ name: 'Mcp Hn', categories: ['developer-tools'] })
    expect(title).toContain('MCP HN')
    expect(title).not.toMatch(/\d+\/100/)
    expect(title).not.toContain('Score')
  })

  it('leads with the name and ends with the brand', () => {
    const title = buildServerTitle({ name: 'Weather', categories: ['data'] })
    expect(title.startsWith('Weather')).toBe(true)
    expect(title.endsWith('| MCPpedia')).toBe(true)
  })

  it('uses the full pattern when it fits in 60 characters', () => {
    expect(buildServerTitle({ name: 'Notion', categories: ['productivity'] })).toBe(
      'Notion — Productivity MCP Server | MCPpedia',
    )
  })

  it('keeps the Claude & Cursor clause when there is room', () => {
    expect(buildServerTitle({ name: 'Git', categories: [] })).toBe(
      'Git — MCP Server for Claude & Cursor | MCPpedia',
    )
  })

  it('degrades instead of overflowing on a long name', () => {
    const long = buildServerTitle({
      name: 'Mcp Server For Enterprise Data Warehouse Integration',
      categories: ['data'],
    })
    expect(long).toBe('MCP Server For Enterprise Data Warehouse Integration | MCPpedia')
    // Only the name itself pushes it over — nothing optional survives.
    expect(long).not.toContain('Claude')
  })

  it('stays within the SERP budget whenever the name allows it', () => {
    for (const name of ['Git', 'Notion', 'Slack', 'Mcp Hn']) {
      expect(buildServerTitle({ name, categories: ['productivity'] }).length).toBeLessThanOrEqual(
        SERVER_TITLE_MAX,
      )
    }
  })

  it('does not say "MCP Server" twice', () => {
    const title = buildServerTitle({ name: 'Filesystem MCP Server', categories: ['data'] })
    expect(title.match(/MCP Server/g)).toHaveLength(1)
    expect(title).toBe('Filesystem MCP Server for Claude & Cursor | MCPpedia')
  })

  it('never says "Other MCP Server" — the catch-all category is not a keyword', () => {
    // 4,604 indexable servers are categorised `other`, more than any real
    // category. Spending title characters on it describes no use case.
    const title = buildServerTitle({ name: 'MCP HN', categories: ['other'] })
    expect(title).not.toContain('Other')
    expect(title).toBe('MCP HN — MCP Server for Claude & Cursor | MCPpedia')
  })

  it('tolerates a missing category', () => {
    expect(buildServerTitle({ name: 'Weather' })).toContain('MCP Server')
  })
})

describe('buildServerDescription', () => {
  it('builds from real data rather than a template', () => {
    expect(
      buildServerDescription({
        name: 'Mcp Hn',
        tagline: 'Search and read Hacker News from your agent',
        tool_count: 4,
        transport: 'stdio',
        score_total: 74,
      }),
    ).toBe(
      'Search and read Hacker News from your agent. 4 tools, stdio transport, score 74/100. Install config for Claude Desktop, Cursor & Claude Code.',
    )
  })

  it('drops clauses it has no data for instead of printing zeros', () => {
    const d = buildServerDescription({ name: 'Weather', tagline: 'Forecasts.', tool_count: 0, score_total: 0 })
    expect(d).not.toContain('0 tools')
    expect(d).not.toContain('0/100')
    expect(d).toContain('Forecasts.')
  })

  it('singularizes a one-tool server', () => {
    expect(buildServerDescription({ name: 'X', tagline: 'Y.', tool_count: 1 })).toContain('1 tool.')
    expect(buildServerDescription({ name: 'X', tagline: 'Y.', tool_count: 2 })).toContain('2 tools.')
  })

  it('names the server when there is no tagline', () => {
    const d = buildServerDescription({ name: 'Mcp Hn', tool_count: 3, score_total: 50 })
    expect(d).toContain('MCP HN is an MCP server.')
  })

  it('strips HTML out of registry taglines', () => {
    const d = buildServerDescription({ name: 'X', tagline: '<b>Fast</b> &amp; small', tool_count: 2 })
    expect(d).not.toContain('<b>')
    expect(d).toContain('Fast & small.')
  })

  it('stays inside the meta-description budget', () => {
    const d = buildServerDescription({
      name: 'X',
      tagline: 'A very long tagline '.repeat(20),
      tool_count: 12,
      transport: 'http',
      score_total: 88,
    })
    expect(d.length).toBeLessThanOrEqual(SERVER_DESCRIPTION_MAX)
    // The distinguishing facts survive; the tagline is what gets cut.
    expect(d).toContain('12 tools, http transport, score 88/100.')
    expect(d).toContain('…')
  })

  it('never ends mid-word when truncated', () => {
    const d = buildServerDescription({
      name: 'X',
      tagline: 'Supercalifragilistic '.repeat(12),
      tool_count: 5,
      score_total: 60,
    })
    // The cut lands after a whole word, not inside one.
    const truncated = d.slice(0, d.indexOf('…'))
    expect(truncated.endsWith('Supercalifragilistic')).toBe(true)
  })

  it('does not double the trailing period of a tagline', () => {
    expect(buildServerDescription({ name: 'X', tagline: 'Ends already.' })).toContain('Ends already. ')
    expect(buildServerDescription({ name: 'X', tagline: 'Ends already.' })).not.toContain('already..')
  })
})
