import { describe, it, expect } from 'vitest'
import { getFeaturedSkills, getTrendingSkills } from '../skills'

describe('getTrendingSkills', () => {
  it('excludes anything already in Featured', () => {
    const featuredSlugs = new Set(getFeaturedSkills().map(s => s.slug))
    const trending = getTrendingSkills(50, new Date('2026-09-03'))
    expect(trending.some(s => featuredSlugs.has(s.slug))).toBe(false)
  })

  it('only includes skills updated within the trailing 60-day window', () => {
    const now = new Date('2026-09-03')
    const cutoff = now.getTime() - 60 * 24 * 60 * 60 * 1000
    const trending = getTrendingSkills(50, now)
    for (const s of trending) {
      expect(s.last_updated).toBeTruthy()
      expect(new Date(s.last_updated as string).getTime()).toBeGreaterThanOrEqual(cutoff)
    }
  })

  it('sorts by stars descending', () => {
    const trending = getTrendingSkills(50, new Date('2026-09-03'))
    for (let i = 1; i < trending.length; i++) {
      expect(trending[i - 1].stars || 0).toBeGreaterThanOrEqual(trending[i].stars || 0)
    }
  })

  it('respects the limit', () => {
    const trending = getTrendingSkills(3, new Date('2026-09-03'))
    expect(trending.length).toBeLessThanOrEqual(3)
  })

  it('returns nothing once every skill has aged out of the window', () => {
    const trending = getTrendingSkills(6, new Date('2030-01-01'))
    expect(trending).toEqual([])
  })
})
