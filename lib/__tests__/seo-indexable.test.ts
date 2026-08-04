import { describe, it, expect } from 'vitest'
import { isServerIndexable, INDEXABLE_FIELD_LIST } from '../seo'

// The gate that decides which of the ~36.5k catalog rows are submitted to
// Google. Both the meta robots tag and the sitemap read it, so these cases are
// the contract that keeps the two in agreement.
describe('isServerIndexable', () => {
  it('rejects an empty registry stub', () => {
    expect(isServerIndexable({})).toBe(false)
  })

  it('rejects a thin row: no description, no tools, low score', () => {
    expect(
      isServerIndexable({
        description: null,
        tool_count: 0,
        score_total: 22,
        is_archived: false,
        review_count: 0,
        community_verified: false,
      }),
    ).toBe(false)
  })

  it('accepts a row with a real description even at score 0', () => {
    expect(isServerIndexable({ description: 'Queries Postgres over MCP.', score_total: 0 })).toBe(true)
  })

  it('treats a whitespace-only description as no description', () => {
    expect(isServerIndexable({ description: '   \n\t ' })).toBe(false)
  })

  it('accepts tools + a mid score', () => {
    expect(isServerIndexable({ tool_count: 3, score_total: 40 })).toBe(true)
  })

  it('rejects tools with a score just under the floor', () => {
    expect(isServerIndexable({ tool_count: 3, score_total: 39 })).toBe(false)
  })

  it('rejects a high-ish score with no tools until it reaches 60', () => {
    expect(isServerIndexable({ tool_count: 0, score_total: 59 })).toBe(false)
    expect(isServerIndexable({ tool_count: 0, score_total: 60 })).toBe(true)
  })

  it('accepts a reviewed server', () => {
    expect(isServerIndexable({ review_count: 1 })).toBe(true)
  })

  it('accepts a community-verified server', () => {
    expect(isServerIndexable({ community_verified: true })).toBe(true)
  })

  it('rejects archived servers regardless of how good they look', () => {
    expect(
      isServerIndexable({
        is_archived: true,
        description: 'A well documented, popular server.',
        tool_count: 20,
        score_total: 95,
        review_count: 12,
        community_verified: true,
      }),
    ).toBe(false)
  })

  it('exposes every field it reads so callers can select them', () => {
    expect([...INDEXABLE_FIELD_LIST].sort()).toEqual(
      ['community_verified', 'description', 'is_archived', 'review_count', 'score_total', 'tool_count'].sort(),
    )
  })
})
