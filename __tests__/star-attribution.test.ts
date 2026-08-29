import { describe, it, expect, vi, afterEach } from 'vitest'
import { decideStarAttribution, normalizeRepoUrl, fetchNpmRepositoryDirectory } from '@/bots/lib/star-attribution'

describe('normalizeRepoUrl', () => {
  // npm writes `git+https://…​.git`, GitHub writes `https://…`, and both must
  // collapse to the same key or the shared-repo census undercounts and the
  // inherited stars survive.
  it('collapses npm and GitHub spellings of one repo', () => {
    const forms = [
      'git+https://github.com/facebook/react.git',
      'https://github.com/facebook/react',
      'https://github.com/facebook/react/',
      'git://github.com/facebook/react.git',
      'git@github.com:facebook/react.git',
      'HTTPS://GitHub.com/Facebook/React',
    ]
    const keys = new Set(forms.map(normalizeRepoUrl))
    expect(keys.size).toBe(1)
    expect([...keys][0]).toBe('github.com/facebook/react')
  })

  it('returns null for nothing', () => {
    expect(normalizeRepoUrl(null)).toBeNull()
    expect(normalizeRepoUrl(undefined)).toBeNull()
    expect(normalizeRepoUrl('')).toBeNull()
  })

  it('keeps distinct repos distinct', () => {
    expect(normalizeRepoUrl('https://github.com/a/one')).not.toBe(normalizeRepoUrl('https://github.com/a/two'))
  })
})

describe('decideStarAttribution', () => {
  it('credits a server that is its own repo', () => {
    expect(decideStarAttribution({ npmDirectory: null, serversSharingRepo: 1 }))
      .toEqual({ attribute: true, reason: 'own-repo' })
  })

  // eslint-plugin-react-hooks lives at packages/eslint-plugin-react-hooks in
  // facebook/react and was credited with all 248,006 of the monorepo's stars.
  it('withholds stars from a declared monorepo subdirectory', () => {
    const v = decideStarAttribution({ npmDirectory: 'packages/eslint-plugin-react-hooks', serversSharingRepo: 1 })
    expect(v.attribute).toBe(false)
    expect(v.reason).toBe('monorepo-subdirectory')
  })

  // babel/babel and modelcontextprotocol/servers declare no directory, so the
  // census is the only thing standing between them and 43,985 stars apiece.
  it('withholds stars when several servers claim the same repo', () => {
    const v = decideStarAttribution({ npmDirectory: null, serversSharingRepo: 3 })
    expect(v.attribute).toBe(false)
    expect(v.reason).toBe('repo-shared-by-multiple-servers')
  })

  it('treats a root directory declaration as owning the repo', () => {
    for (const dir of ['.', '/', './', '']) {
      expect(decideStarAttribution({ npmDirectory: dir, serversSharingRepo: 1 }).attribute).toBe(true)
    }
  })

  // A registry hiccup returns null. Reading that as "monorepo package" would
  // zero a legitimate count on a transient network failure, so the default has
  // to stay permissive.
  it('defaults to attributing when the npm lookup yields nothing', () => {
    expect(decideStarAttribution({}).attribute).toBe(true)
    expect(decideStarAttribution({ npmDirectory: null }).attribute).toBe(true)
  })

  it('prefers the directory reason when both signals fire', () => {
    expect(decideStarAttribution({ npmDirectory: 'packages/vite', serversSharingRepo: 4 }).reason)
      .toBe('monorepo-subdirectory')
  })
})

describe('fetchNpmRepositoryDirectory', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const packument = {
    'dist-tags': { latest: '1.0.0' },
    versions: { '1.0.0': { repository: { type: 'git', url: 'git+https://github.com/facebook/react.git', directory: 'packages/eslint-plugin-react-hooks' } } },
  }

  it('reads the directory off the latest version', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => packument })))
    expect(await fetchNpmRepositoryDirectory('eslint-plugin-react-hooks')).toBe('packages/eslint-plugin-react-hooks')
  })

  // npm's abbreviated packument (application/vnd.npm.install-v1+json) omits
  // `repository` entirely. Requesting it makes this function return null for
  // every package, silently disabling the monorepo signal and re-attributing
  // every inherited star count. That shipped once; this stops it shipping twice.
  it('does not request the abbreviated packument', async () => {
    const spy = vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
      void _url
      void init
      return { ok: true, json: async () => packument }
    })
    vi.stubGlobal('fetch', spy)
    await fetchNpmRepositoryDirectory('any-package')
    const accept = String(spy.mock.calls[0]?.[1]?.headers?.Accept ?? '')
    expect(accept).not.toContain('install-v1')
  })

  it('falls back to the top-level repository field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ repository: { directory: 'sub/pkg' } }) })))
    expect(await fetchNpmRepositoryDirectory('x')).toBe('sub/pkg')
  })

  it('returns null when the package declares no directory', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { repository: { url: 'https://github.com/n8n-io/n8n' } } } }) })))
    expect(await fetchNpmRepositoryDirectory('n8n')).toBeNull()
  })

  // A registry hiccup must read as "unknown", never as "monorepo package" —
  // the latter would zero a legitimate star count on a transient failure.
  it('returns null on a failed or throwing request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })))
    expect(await fetchNpmRepositoryDirectory('x')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await fetchNpmRepositoryDirectory('x')).toBeNull()
  })
})
