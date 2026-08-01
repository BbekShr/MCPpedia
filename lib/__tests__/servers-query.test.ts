import { describe, it, expect } from 'vitest'
import { normalizeServersQuery } from '../servers-query'

function params(raw: Record<string, string | undefined>, offset = 0) {
  const n = normalizeServersQuery(raw, offset)
  if (n.kind !== 'query') throw new Error('expected a query, got empty')
  return n.params
}

describe('normalizeServersQuery — sort collapsing', () => {
  it('collapses an unrecognized catalog sort onto the default', () => {
    expect(params({ sort: 'zzz' })).toEqual(params({ sort: '' }))
    expect(params({ sort: 'zzz' })).toEqual(params({}))
  })

  it('preserves every recognized catalog sort', () => {
    expect(params({ sort: 'commit' }).sort).toBe('commit')
    expect(params({ sort: 'stars' }).sort).toBe('stars')
    expect(params({ sort: 'downloads' }).sort).toBe('downloads')
    expect(params({ sort: 'newest' }).sort).toBe('newest')
    expect(params({ sort: 'name' }).sort).toBe('name')
  })

  it('maps search sorts the RPC does not recognize onto its real fallback', () => {
    // The RPC has no `commit` arm and falls through to `github_stars desc`.
    expect(params({ q: 'x', sort: 'zzz' }).sort).toBe('stars')
    expect(params({ q: 'x', sort: 'commit' }).sort).toBe('stars')
    expect(params({ q: 'x', sort: 'stars' }).sort).toBe('stars')
  })

  it('defaults a bare search to relevance', () => {
    expect(params({ q: 'x' }).sort).toBe('relevance')
  })
})

describe('normalizeServersQuery — mode', () => {
  it('selects the search branch when q is present', () => {
    expect(params({ q: 'x' }).mode).toBe('search')
  })

  it('selects the catalog branch when q is absent', () => {
    expect(params({}).mode).toBe('catalog')
    expect(params({ q: '' }).mode).toBe('catalog')
  })

  it('does NOT trim q — whitespace still selects the search branch', () => {
    const p = params({ q: '  ' })
    expect(p.mode).toBe('search')
    expect(p.q).toBe('  ')
  })
})

describe('normalizeServersQuery — filters', () => {
  it('round-trips valid members', () => {
    expect(params({ category: 'data' }).category).toBe('data')
    expect(params({ status: 'active' }).status).toBe('active')
    expect(params({ pricing: 'free' }).pricing).toBe('free')
    expect(params({ author: 'official' }).author).toBe('official')
    expect(params({ transport: 'stdio' }).transport).toBe('stdio')
  })

  it('short-circuits an out-of-range value to empty rather than to ""', () => {
    expect(normalizeServersQuery({ category: 'zzz' }, 0)).toEqual({ kind: 'empty' })
    expect(normalizeServersQuery({ status: 'zzz' }, 0)).toEqual({ kind: 'empty' })
    expect(normalizeServersQuery({ pricing: 'zzz' }, 0)).toEqual({ kind: 'empty' })
    expect(normalizeServersQuery({ author: 'zzz' }, 0)).toEqual({ kind: 'empty' })
    expect(normalizeServersQuery({ transport: 'zzz' }, 0)).toEqual({ kind: 'empty' })
  })

  it('treats an absent filter as unfiltered', () => {
    const p = params({})
    expect([p.category, p.status, p.pricing, p.author, p.transport]).toEqual(['', '', '', '', ''])
  })

  it('does not accept inherited Object members as filter values', () => {
    expect(normalizeServersQuery({ transport: 'constructor' }, 0)).toEqual({ kind: 'empty' })
    expect(normalizeServersQuery({ status: 'toString' }, 0)).toEqual({ kind: 'empty' })
  })
})

describe('normalizeServersQuery — min_score', () => {
  it('floors junk and negatives to 0', () => {
    expect(params({ min_score: 'abc' }).minScore).toBe(0)
    expect(params({ min_score: '-5' }).minScore).toBe(0)
    expect(params({ min_score: '0' }).minScore).toBe(0)
  })

  it('preserves in-range values', () => {
    expect(params({ min_score: '80' }).minScore).toBe(80)
    expect(params({ min_score: '100' }).minScore).toBe(100)
  })

  it('short-circuits above the 100-point ceiling', () => {
    expect(normalizeServersQuery({ min_score: '101' }, 0)).toEqual({ kind: 'empty' })
  })
})

describe('normalizeServersQuery — cache-key space', () => {
  it('collapses distinct junk sorts onto ONE key', () => {
    expect(JSON.stringify(params({ sort: 'a' }))).toBe(JSON.stringify(params({ sort: 'b' })))
  })

  it('keeps result-changing inputs distinct', () => {
    expect(JSON.stringify(params({ sort: 'stars' }))).not.toBe(
      JSON.stringify(params({ sort: 'name' })),
    )
    expect(JSON.stringify(params({ category: 'data' }))).not.toBe(
      JSON.stringify(params({ category: 'finance' })),
    )
    expect(JSON.stringify(params({}, 0))).not.toBe(JSON.stringify(params({}, 20)))
  })
})
