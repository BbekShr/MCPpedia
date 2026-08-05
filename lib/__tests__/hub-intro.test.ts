import { describe, it, expect } from 'vitest'
import { buildHubIntro, buildCompareVerdict, buildCatalogIntro } from '../hub-intro'

const AGG = { total: 2313, scored50: 559, scored70: 181, official: 40, withCves: 2 }
const LEADERS = [
  { name: 'Postgres', slug: 'postgres', score: 91 },
  { name: 'SQLite', slug: 'sqlite', score: 84 },
  { name: 'MongoDB', slug: 'mongodb', score: 78 },
]

function words(paragraphs: string[]): number {
  return paragraphs.join(' ').trim().split(/\s+/).length
}

describe('buildHubIntro', () => {
  const intro = buildHubIntro({ subject: 'database MCP servers', agg: AGG, leaders: LEADERS })

  it('lands in the 150-300 word range', () => {
    expect(words(intro)).toBeGreaterThanOrEqual(150)
    expect(words(intro)).toBeLessThanOrEqual(300)
  })

  it('quotes the live aggregates, not a template', () => {
    const text = intro.join(' ')
    expect(text).toContain('2,313 database MCP servers')
    expect(text).toContain('559')
    expect(text).toContain('181')
    expect(text).toContain('40')
  })

  it('names the leader and its score', () => {
    expect(intro.join(' ')).toContain('Postgres leads the list at 91/100')
  })

  it('names the runners-up', () => {
    expect(intro.join(' ')).toContain('SQLite (84) and MongoDB (78)')
  })

  it('reports the CVE count when there is one', () => {
    expect(intro.join(' ')).toContain('2 currently carry an open CVE')
  })

  it('says so plainly when nothing has a CVE', () => {
    const clean = buildHubIntro({ subject: 'x servers', agg: { ...AGG, withCves: 0 }, leaders: LEADERS })
    expect(clean.join(' ')).toContain('None currently carry an open CVE')
  })

  it('handles a category with no vendor-published servers', () => {
    const community = buildHubIntro({ subject: 'x servers', agg: { ...AGG, official: 0 }, leaders: LEADERS })
    expect(community.join(' ')).toContain('they are all community builds')
  })

  it('still produces copy with no leaders', () => {
    const noLeaders = buildHubIntro({ subject: 'x servers', agg: AGG, leaders: [] })
    expect(noLeaders.length).toBeGreaterThan(0)
    expect(noLeaders.join(' ')).not.toContain('leads the list')
  })

  it('returns nothing rather than lying when aggregates are unavailable', () => {
    expect(buildHubIntro({ subject: 'x', agg: null, leaders: LEADERS })).toEqual([])
    expect(buildHubIntro({ subject: 'x', agg: { ...AGG, total: 0 }, leaders: LEADERS })).toEqual([])
  })

  it('produces different copy for different categories', () => {
    const a = buildHubIntro({ subject: 'database MCP servers', agg: AGG, leaders: LEADERS }).join(' ')
    const b = buildHubIntro({
      subject: 'security MCP servers',
      agg: { total: 412, scored50: 90, scored70: 31, official: 5, withCves: 0 },
      leaders: [{ name: 'Semgrep', slug: 'semgrep', score: 88 }],
    }).join(' ')
    expect(a).not.toBe(b)
  })
})

describe('buildCompareVerdict', () => {
  const base = { toolCount: 5, cveCount: 0, official: false, stars: 100 }

  it('answers first — the recommendation is in the opening clause', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 88 },
      { ...base, name: 'Beta', score: 61 },
    )
    expect(v.startsWith('Short answer: pick Alpha.')).toBe(true)
  })

  it('picks the higher score regardless of argument order', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 61 },
      { ...base, name: 'Beta', score: 88 },
    )
    expect(v).toContain('pick Beta')
  })

  it('gives the CVE difference as a reason when there is one', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 88, cveCount: 0 },
      { ...base, name: 'Beta', score: 61, cveCount: 3 },
    )
    expect(v).toContain('no open CVEs while Beta has 3')
  })

  it('gives vendor provenance as a reason', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 88, official: true },
      { ...base, name: 'Beta', score: 61 },
    )
    expect(v).toContain('published by the vendor')
  })

  it('refuses to declare a winner inside the rescore noise', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 74, toolCount: 9 },
      { ...base, name: 'Beta', score: 72, toolCount: 3 },
    )
    expect(v).toContain('it is close')
    expect(v).not.toContain('pick ')
    expect(v).toContain('2-point gap')
  })

  it('always states both scores', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 88 },
      { ...base, name: 'Beta', score: 61 },
    )
    expect(v).toContain('88/100')
    expect(v).toContain('61/100')
  })

  it('falls back to a generic reason when nothing else separates them', () => {
    const v = buildCompareVerdict(
      { ...base, name: 'Alpha', score: 88 },
      { ...base, name: 'Beta', score: 61 },
    )
    expect(v).toContain('weighted security, maintenance and documentation inputs')
  })
})

describe('buildCatalogIntro', () => {
  const intro = buildCatalogIntro({ total: 36614, leader: { name: 'Postgres', score: 91 } })

  it('leads with the live catalog total, formatted', () => {
    expect(intro[0]).toContain('MCPpedia tracks 36,614 Model Context Protocol servers')
  })

  it('names the current leader and its score', () => {
    expect(intro.join(' ')).toContain('Postgres currently leads at 91/100')
  })

  it('explains what the score is made of', () => {
    // The one sentence a reader or answer engine needs to trust the ranking.
    expect(intro.join(' ')).toContain('token efficiency')
  })

  it('degrades to the score explainer when the page has no leader row', () => {
    const noLeader = buildCatalogIntro({ total: 36614, leader: null })
    expect(noLeader).toHaveLength(2)
    expect(noLeader.join(' ')).not.toContain('currently leads')
    expect(noLeader.join(' ')).toContain('token efficiency')
  })

  it('omits a leader with no score rather than printing "0/100"', () => {
    const unscored = buildCatalogIntro({ total: 36614, leader: { name: 'Nameless', score: 0 } })
    expect(unscored.join(' ')).not.toContain('Nameless')
    expect(unscored.join(' ')).not.toContain('0/100')
  })

  it('returns nothing when the snapshot is unavailable, rather than "0 servers"', () => {
    // /servers degrades softly on a home_stats miss: catalogTotal falls back to
    // the live count, which is 0 when the listing query also failed.
    expect(buildCatalogIntro({ total: 0, leader: null })).toEqual([])
  })
})
