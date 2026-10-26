import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPageReadme, GITHUB_USER_AGENT } from '../github'

type Call = { url: string; init: RequestInit & { next?: { revalidate?: number } } }

function mockFetch(responses: Record<string, Response>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: Call['init']) => {
    calls.push({ url, init })
    return responses[url] ?? new Response('not found', { status: 404 })
  }))
  return calls
}

const RAW = 'https://raw.githubusercontent.com/acme/widget/HEAD/README.md'
const API = 'https://api.github.com/repos/acme/widget/readme'

afterEach(() => vi.unstubAllGlobals())

describe('fetchPageReadme', () => {
  it('sends a User-Agent on every request (GitHub 403s without one, and Workers fetch sends none)', async () => {
    const calls = mockFetch({})
    await fetchPageReadme('acme', 'widget')
    expect(calls.length).toBe(2)
    for (const c of calls) {
      expect((c.init.headers as Record<string, string>)['User-Agent']).toBe(GITHUB_USER_AGENT)
    }
  })

  it('uses raw.githubusercontent.com first and skips the rate-limited API when it hits', async () => {
    const calls = mockFetch({ [RAW]: new Response('# Widget') })
    expect(await fetchPageReadme('acme', 'widget')).toBe('# Widget')
    expect(calls.map(c => c.url)).toEqual([RAW])
  })

  it('falls back to the API for repos without a root README.md', async () => {
    const calls = mockFetch({ [API]: new Response('widget readme.rst') })
    expect(await fetchPageReadme('acme', 'widget')).toBe('widget readme.rst')
    expect(calls.map(c => c.url)).toEqual([RAW, API])
    expect((calls[1].init.headers as Record<string, string>).Accept).toBe('application/vnd.github.v3.raw')
  })

  it('returns null when both sources fail', async () => {
    mockFetch({ [API]: new Response('Request forbidden', { status: 403 }) })
    expect(await fetchPageReadme('acme', 'widget')).toBeNull()
  })

  it('keeps every fetch at >= 30d revalidate so it cannot cap the /s/[slug] ISR window', async () => {
    const calls = mockFetch({})
    await fetchPageReadme('acme', 'widget')
    for (const c of calls) expect(c.init.next?.revalidate).toBeGreaterThanOrEqual(2592000)
  })
})
