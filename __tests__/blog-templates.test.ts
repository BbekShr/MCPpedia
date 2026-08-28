import { describe, it, expect } from 'vitest'
import {
  renderArticle,
  renderWeeklyRoundup,
  renderSpotlight,
  renderTrending,
  renderSecurityAlert,
  renderCategoryDeepDive,
  mdxText,
  type ServerRow,
} from '@/bots/lib/blog-templates'

const server = (over: Partial<ServerRow> = {}): ServerRow => ({
  slug: 'example-server',
  name: 'Example Server',
  tagline: 'Does a useful thing.',
  github_stars: 120,
  score_total: 82,
  score_security: 24,
  score_maintenance: 20,
  score_efficiency: 16,
  score_documentation: 12,
  score_compatibility: 10,
  tool_count: 7,
  ...over,
})

describe('mdxText', () => {
  // MDX parses `{` as an expression and `<` as a JSX tag. A server name or
  // tagline carrying either would break the page build for a bot-written file
  // that no human reviews before it ships.
  it('escapes MDX-significant characters', () => {
    expect(mdxText('a{b}c')).toBe('a&#123;b&#125;c')
    expect(mdxText('<script>')).toBe('&lt;script&gt;')
  })

  it('collapses whitespace and handles nullish input', () => {
    expect(mdxText('a\n\n  b')).toBe('a b')
    expect(mdxText(null)).toBe('')
    expect(mdxText(undefined)).toBe('')
  })
})

describe('renderWeeklyRoundup', () => {
  const stats = { totalServers: 35075, newThisWeek: 12 }

  it('returns null when there is nothing to report', () => {
    expect(renderWeeklyRoundup([], [], stats)).toBeNull()
  })

  it('reports only counts it was given', () => {
    const out = renderWeeklyRoundup([server()], [], stats)!
    expect(out.body).toContain('35,075')
    expect(out.body).toContain('[Example Server](/s/example-server)')
    expect(out.title.length).toBeLessThanOrEqual(79)
  })

  it('escapes hostile server names into the body and props', () => {
    const out = renderWeeklyRoundup([server({ name: 'Evil <script> {x}' })], [], stats)!
    expect(out.body).not.toMatch(/<script>/)
    expect(out.body).not.toMatch(/\{x\}/)
  })
})

describe('renderSpotlight', () => {
  it('breaks the score into the five scoring dimensions', () => {
    const out = renderSpotlight(server())!
    for (const dim of ['Security', 'Maintenance', 'Efficiency', 'Documentation', 'Compatibility']) {
      expect(out.body).toContain(`label="${dim}"`)
    }
    expect(out.body).toContain('82/100')
  })

  it('warns when the server carries open advisories', () => {
    const out = renderSpotlight(server({ cve_count: 3 }))!
    expect(out.body).toContain('Callout type="warning"')
    expect(out.body).toContain('3 open advisories')
  })

  it('omits the advisory warning when there are none', () => {
    expect(renderSpotlight(server({ cve_count: 0 }))!.body).not.toContain('open advisories')
  })
})

describe('renderTrending', () => {
  it('ranks by the star gain it was handed', () => {
    const out = renderTrending([
      server({ slug: 'a', name: 'A', starGain: 80 }),
      server({ slug: 'b', name: 'B', starGain: 20 }),
    ])!
    expect(out.body.indexOf('/s/a')).toBeLessThan(out.body.indexOf('/s/b'))
    expect(out.body).toContain('+80')
  })

  it('returns null with no trending servers', () => {
    expect(renderTrending([])).toBeNull()
  })
})

describe('renderSecurityAlert', () => {
  it('returns null with no advisories', () => {
    expect(renderSecurityAlert([])).toBeNull()
  })

  // OSV descriptions are themselves markdown. Collapsed to one line without
  // stripping the block syntax, a leading `###` renders as a heading mid-post
  // and wrecks the document outline.
  it('flattens markdown headings out of advisory prose', () => {
    const out = renderSecurityAlert([
      {
        id: 'adv-1',
        cve_id: 'CVE-2026-0001',
        severity: 'critical',
        title: 'Path traversal',
        description: '### Summary\nAn attacker can read any file.\n### Impact\nTotal.',
        servers: { slug: 'example-server', name: 'Example Server' },
      },
    ])!
    expect(out.body).not.toMatch(/^#{1,6} (Summary|Impact)/m)
    expect(out.body).toContain('An attacker can read any file.')
  })

  it('counts distinct affected servers, not advisories', () => {
    const out = renderSecurityAlert([
      { id: '1', cve_id: 'CVE-1', severity: 'high', servers: { slug: 'x', name: 'X' } },
      { id: '2', cve_id: 'CVE-2', severity: 'high', servers: { slug: 'x', name: 'X' } },
    ])!
    expect(out.body).toContain('1 catalogued MCP server')
  })
})

describe('renderCategoryDeepDive', () => {
  it('refuses to rank fewer than three servers', () => {
    expect(renderCategoryDeepDive('data', [server(), server({ slug: 'b' })])).toBeNull()
  })

  it('titles the category in human form', () => {
    const rows = [server({ slug: 'a' }), server({ slug: 'b' }), server({ slug: 'c' })]
    expect(renderCategoryDeepDive('developer-tools', rows)!.title).toContain('Developer Tools')
  })
})

describe('renderArticle', () => {
  // buildArticleFromResponse parses the trailing ```json block for frontmatter,
  // so the templates must emit the same shape the model was prompted for.
  it('appends a parseable json metadata block', () => {
    const out = renderArticle('server-spotlight', { server: server() })!
    const match = out.match(/```json\s*\n?(\{[\s\S]*?\})\s*\n?```/)
    expect(match).not.toBeNull()
    const meta = JSON.parse(match![1])
    expect(meta.title).toBeTruthy()
    expect(meta.description.length).toBeLessThanOrEqual(160)
    expect(meta.hook).toBeTruthy()
  })

  it('returns null for a type it cannot render', () => {
    expect(renderArticle('seo-guide', {})).toBeNull()
  })

  it('returns null rather than an empty post when the data is too thin', () => {
    expect(renderArticle('category-deep-dive', { category: 'data', servers: [] })).toBeNull()
  })
})
