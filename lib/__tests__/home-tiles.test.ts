import { describe, it, expect } from 'vitest'
import { buildUseCaseTiles, buildCategoryTiles } from '../home-tiles'
import { CATEGORIES } from '../constants'
import { HOMEPAGE_USECASES } from '@/components/home/UseCases'

const ok = (data: unknown) => ({ data, error: null })
const failed = { data: null, error: { message: 'canceling statement due to statement timeout' } }

describe('buildUseCaseTiles', () => {
  it('returns null when the RPC errored', () => {
    expect(buildUseCaseTiles(failed)).toBeNull()
  })

  // The regression S81 exists to pin: a snapshot-backed RPC that has never been
  // seeded answers `{data: null, error: null}` — a SUCCESS. Mapping that through
  // `?? {}` produced six tiles all reading "0 servers".
  it('returns null for an unseeded snapshot (successful, data null)', () => {
    expect(buildUseCaseTiles(ok(null))).toBeNull()
  })

  it('returns null for an empty-but-successful result', () => {
    expect(buildUseCaseTiles(ok({}))).toBeNull()
  })

  it('never produces zero-count placeholder tiles for an absent aggregate', () => {
    for (const result of [failed, ok(null), ok({})]) {
      const tiles = buildUseCaseTiles(result)
      expect(tiles).toBeNull()
      expect(tiles?.some(t => t.count === 0)).toBeUndefined()
    }
  })

  it('maps a populated result onto every use-case tile with its real count', () => {
    const top = [{ slug: 'a', name: 'A', homepage_url: null, author_github: null }]
    const tiles = buildUseCaseTiles(
      ok({
        developers: { count: 1200, top },
        security: { count: 42, top: [] },
      }),
    )

    expect(tiles).toHaveLength(HOMEPAGE_USECASES.length)
    expect(tiles?.map(t => t.id)).toEqual(HOMEPAGE_USECASES.map(uc => uc.id))
    expect(tiles?.find(t => t.id === 'developers')).toMatchObject({
      count: 1200,
      top,
      title: 'Best for developers',
    })
    expect(tiles?.find(t => t.id === 'security')?.count).toBe(42)
    // A use case absent from a PRESENT aggregate genuinely has no servers.
    expect(tiles?.find(t => t.id === 'ai-agents')).toMatchObject({ count: 0, top: [] })
  })
})

describe('buildCategoryTiles', () => {
  it('returns null when the RPC errored', () => {
    expect(buildCategoryTiles(failed)).toBeNull()
  })

  it('returns null for an unseeded snapshot (successful, data null)', () => {
    expect(buildCategoryTiles(ok(null))).toBeNull()
  })

  it('returns null for an empty-but-successful result', () => {
    expect(buildCategoryTiles(ok({}))).toBeNull()
  })

  it('never produces zero-count placeholder tiles for an absent aggregate', () => {
    for (const result of [failed, ok(null), ok({})]) {
      const tiles = buildCategoryTiles(result)
      expect(tiles).toBeNull()
      expect(tiles?.some(t => t.count === 0)).toBeUndefined()
    }
  })

  it('projects a populated result onto the full canonical category list', () => {
    const [first, second, third, fourth] = CATEGORIES
    const tiles = buildCategoryTiles(
      ok({ [first]: 500, [second]: 300, [third]: 100, [fourth]: 10 }),
    )

    expect(tiles).toHaveLength(CATEGORIES.length)
    expect(tiles?.map(t => t.slug)).toEqual([...CATEGORIES])
    expect(tiles?.find(t => t.slug === first)?.count).toBe(500)
    // A category missing from a PRESENT aggregate has no servers — a real 0.
    expect(tiles?.find(t => t.slug === CATEGORIES[CATEGORIES.length - 1])?.count).toBe(0)
    // "Hot" is the top 3 non-empty by count, not the top 4.
    expect(tiles?.filter(t => t.hot).map(t => t.slug)).toEqual([first, second, third])
  })

  it('marks nothing hot when every category is empty', () => {
    const tiles = buildCategoryTiles(ok({ [CATEGORIES[0]]: 0 }))
    expect(tiles?.some(t => t.hot)).toBe(false)
  })
})
