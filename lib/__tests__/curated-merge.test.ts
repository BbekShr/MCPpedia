import { describe, it, expect } from 'vitest'
import { pickCuratedBackfill, isMissingValue, CURATED_FIELDS } from '../curated-merge'

describe('isMissingValue', () => {
  it('treats nulls, blank strings and empty JSONB as gaps', () => {
    for (const v of [null, undefined, '', '   ', [], {}]) {
      expect(isMissingValue(v)).toBe(true)
    }
  })

  it('treats real values as present', () => {
    for (const v of ['MIT', ['a'], { a: 1 }, 0, false]) {
      expect(isMissingValue(v)).toBe(false)
    }
  })
})

describe('pickCuratedBackfill', () => {
  it('fills a gap on the keeper from the row about to be archived', () => {
    const updates = pickCuratedBackfill(
      { homepage_url: null, api_name: null },
      { homepage_url: 'https://example.com/api/', api_name: 'Example API' }
    )
    expect(updates).toEqual({
      homepage_url: 'https://example.com/api/',
      api_name: 'Example API',
    })
  })

  it('never overwrites a value the keeper already holds', () => {
    const updates = pickCuratedBackfill(
      { homepage_url: 'https://keeper.example', license: 'MIT' },
      { homepage_url: 'https://dupe.example', license: 'Apache-2.0' }
    )
    expect(updates).toEqual({})
  })

  it("counts api_pricing 'unknown' as a gap but keeps a deliberate value", () => {
    expect(pickCuratedBackfill({ api_pricing: 'unknown' }, { api_pricing: 'paid' }))
      .toEqual({ api_pricing: 'paid' })
    expect(pickCuratedBackfill({ api_pricing: 'free' }, { api_pricing: 'paid' }))
      .toEqual({})
    // A dupe that is itself unset must not push 'unknown' onto the keeper.
    expect(pickCuratedBackfill({ api_pricing: 'unknown' }, { api_pricing: 'unknown' }))
      .toEqual({})
  })

  it('fills empty JSONB columns but not populated ones', () => {
    expect(pickCuratedBackfill({ tools: [] }, { tools: [{ name: 'a' }] }))
      .toEqual({ tools: [{ name: 'a' }] })
    expect(pickCuratedBackfill({ tools: [{ name: 'keeper' }] }, { tools: [{ name: 'dupe' }] }))
      .toEqual({})
  })

  it('leaves identity and bot-refreshed columns alone', () => {
    const updates = pickCuratedBackfill(
      { slug: 'keeper', github_url: null, npm_package: null, github_stars: 0, score_total: 10 },
      { slug: 'dupe', github_url: 'https://github.com/o/r', npm_package: 'x', github_stars: 99, score_total: 90 }
    )
    expect(updates).toEqual({})
    for (const f of ['slug', 'github_url', 'npm_package', 'github_stars', 'score_total']) {
      expect(CURATED_FIELDS).not.toContain(f)
    }
  })
})
