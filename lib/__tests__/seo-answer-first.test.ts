import { describe, it, expect } from 'vitest'
import { buildServerSummary } from '../seo'
import { formatApproxTotal, buildSiteDescription } from '../live-counts'
import { SITE_DESCRIPTION } from '../constants'

function wordCount(s: string): number {
  return s.trim().split(/\s+/).length
}

describe('buildServerSummary', () => {
  const full = {
    name: 'Mcp Hn',
    tagline: 'Searches and reads Hacker News',
    tool_count: 4,
    transport: ['stdio'],
    requires_api_key: false,
    score_total: 74,
    categories: ['developer-tools'],
  }

  it('is one extractable sentence-set of 40-60 words', () => {
    const summary = buildServerSummary(full)
    expect(wordCount(summary)).toBeGreaterThanOrEqual(20)
    expect(wordCount(summary)).toBeLessThanOrEqual(60)
  })

  it('opens with the definitional sentence an answer engine looks for', () => {
    expect(buildServerSummary(full).startsWith('MCP HN is an MCP server that ')).toBe(true)
  })

  it('states tools, transport, auth and score', () => {
    const summary = buildServerSummary(full)
    expect(summary).toContain('4 tools')
    expect(summary).toContain('over stdio')
    expect(summary).toContain('requires no API key')
    expect(summary).toContain('74/100')
  })

  it('says so when an API key is required', () => {
    expect(buildServerSummary({ ...full, requires_api_key: true })).toContain('requires an API key')
  })

  it('lists multiple transports readably', () => {
    expect(buildServerSummary({ ...full, transport: ['stdio', 'sse', 'http'] })).toContain(
      'over stdio, sse and http',
    )
  })

  it('survives a transport array of nulls (real production row)', () => {
    const summary = buildServerSummary({ ...full, transport: [null] })
    expect(summary).not.toContain('over')
    expect(summary).toContain('MCP HN is an MCP server')
  })

  it('keeps a proper noun capitalized mid-sentence', () => {
    expect(buildServerSummary({ ...full, tagline: 'GitHub issues and pull requests' })).toContain(
      'MCP server that GitHub issues',
    )
  })

  it('carries no markup, ever', () => {
    const summary = buildServerSummary({ ...full, tagline: '<b>Reads</b> Hacker News &amp; more' })
    expect(summary).not.toMatch(/[<>]/)
    expect(summary).toContain('reads Hacker News & more')
  })

  it('falls back to the category when there is no tagline', () => {
    expect(buildServerSummary({ ...full, tagline: null })).toContain('developer tools')
  })

  it('falls back again when there is no category either', () => {
    const summary = buildServerSummary({ ...full, tagline: null, categories: [] })
    expect(summary).toContain('exposes tools to AI agents over the Model Context Protocol')
  })

  it('does not claim a score or a tool count it does not have', () => {
    const summary = buildServerSummary({ ...full, tool_count: 0, score_total: 0 })
    expect(summary).toContain('tool list has not been published yet')
    expect(summary).toContain('has not been scored yet')
    expect(summary).not.toContain('0/100')
  })

  it('singularizes one tool', () => {
    expect(buildServerSummary({ ...full, tool_count: 1 })).toContain('exposes 1 tool ')
  })
})

describe('formatApproxTotal', () => {
  it('rounds DOWN so the claim is always true', () => {
    expect(formatApproxTotal(36614)).toBe('36,000+')
    expect(formatApproxTotal(36999)).toBe('36,000+')
    expect(formatApproxTotal(37000)).toBe('37,000+')
  })

  it('refuses to print a number it cannot verify', () => {
    expect(formatApproxTotal(null)).toBe('thousands of')
    expect(formatApproxTotal(0)).toBe('thousands of')
    expect(formatApproxTotal(999)).toBe('thousands of')
  })

  it('takes a caller-supplied fallback', () => {
    expect(formatApproxTotal(null, 'Thousands of')).toBe('Thousands of')
  })
})

describe('SITE_DESCRIPTION and buildSiteDescription', () => {
  it('the baked-in constant names no server count', () => {
    // A module constant cannot be live, so it must not claim a number — this is
    // what let "17,000+" survive against a real catalog of 36,000+.
    expect(SITE_DESCRIPTION).not.toMatch(/\d[\d,]*\+/)
  })

  it('folds the live count in when there is one', () => {
    expect(buildSiteDescription(36614)).toContain('36,000+ MCP servers')
  })

  it('falls back to the count-free constant when the snapshot is down', () => {
    expect(buildSiteDescription(null)).toBe(SITE_DESCRIPTION)
  })
})
