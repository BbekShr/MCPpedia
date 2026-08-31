import { describe, it, expect } from 'vitest'
import { MAX_JOBS, DEFAULT_MODEL, modelForType, type ArticleType } from '@/bots/lib/blog-planning'

const ARTICLE_TYPES: ArticleType[] = [
  'weekly-roundup',
  'server-spotlight',
  'security-alert',
  'trending',
  'category-deep-dive',
  'seo-guide',
]

describe('modelForType', () => {
  it.each(ARTICLE_TYPES)('returns claude-sonnet-5 for %s', (type) => {
    expect(modelForType(type)).toBe('claude-sonnet-5')
  })

  it('always returns DEFAULT_MODEL', () => {
    for (const type of ARTICLE_TYPES) {
      expect(modelForType(type)).toBe(DEFAULT_MODEL)
    }
  })
})

describe('MAX_JOBS', () => {
  it('caps the scheduled run to one article', () => {
    expect(MAX_JOBS).toBe(1)
  })
})
