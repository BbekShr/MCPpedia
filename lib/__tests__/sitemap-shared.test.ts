import { describe, it, expect } from 'vitest'
import { renderUrlset, buildStaticEntries } from '../sitemap-shared'
import { SITE_URL } from '../constants'

describe('renderUrlset', () => {
  it('emits loc and lastmod only — no changefreq, no priority', () => {
    const xml = renderUrlset([
      { url: 'https://mcppedia.org/s/a', lastModified: new Date('2026-01-02T03:04:05.000Z') },
    ])
    expect(xml).toContain('<loc>https://mcppedia.org/s/a</loc>')
    expect(xml).toContain('<lastmod>2026-01-02T03:04:05.000Z</lastmod>')
    expect(xml).not.toContain('changefreq')
    expect(xml).not.toContain('priority')
  })

  it('omits lastmod entirely when there is none', () => {
    const xml = renderUrlset([{ url: 'https://mcppedia.org/s/a' }])
    expect(xml).toContain('<url><loc>https://mcppedia.org/s/a</loc></url>')
    expect(xml).not.toContain('lastmod')
  })

  it('escapes XML metacharacters in the loc', () => {
    const xml = renderUrlset([{ url: 'https://mcppedia.org/servers?q=a&b=1' }])
    expect(xml).toContain('q=a&amp;b=1')
  })
})

describe('buildStaticEntries', () => {
  const entries = buildStaticEntries()
  const urls = entries.map(e => e.url)

  it('publishes the homepage with a trailing slash to match its canonical', () => {
    expect(urls).toContain(`${SITE_URL}/`)
    expect(urls).not.toContain(SITE_URL)
  })

  it('never carries changefreq or priority', () => {
    for (const e of entries) {
      expect(e).not.toHaveProperty('changeFrequency')
      expect(e).not.toHaveProperty('priority')
    }
  })

  it('emits no duplicate URLs', () => {
    expect(new Set(urls).size).toBe(urls.length)
  })
})
