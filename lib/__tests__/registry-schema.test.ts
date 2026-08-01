import { describe, it, expect } from 'vitest'
import {
  parseRegistryPage,
  parseRegistryEntry,
  unwrapRegistryEntry,
  deriveTransports,
  isIngestable,
  OFFICIAL_META_KEY,
} from '../registry-schema'
import { TRANSPORTS } from '../constants'
import fixture from './fixtures/registry-servers.json'

/** Wrap a server object in the `{ server, _meta }` envelope the registry serves. */
function entry(server: unknown, meta?: Record<string, unknown>) {
  return meta ? { server, _meta: { [OFFICIAL_META_KEY]: meta } } : { server }
}

describe('parseRegistryPage (live fixture)', () => {
  it('reads the entry list and the pagination cursor off the real envelope', () => {
    const { entries, nextCursor } = parseRegistryPage(fixture)
    expect(entries.length).toBeGreaterThan(0)
    expect(nextCursor === null || typeof nextCursor === 'string').toBe(true)
  })

  it('falls back through servers -> items -> bare array, and to a null cursor', () => {
    expect(parseRegistryPage({ items: [1, 2] }).entries).toEqual([1, 2])
    expect(parseRegistryPage([1]).entries).toEqual([1])
    expect(parseRegistryPage({ servers: [], cursor: 'abc' }).nextCursor).toBe('abc')
    expect(parseRegistryPage({ servers: [] }).nextCursor).toBeNull()
    expect(parseRegistryPage(null).entries).toEqual([])
  })

  it('falls through an empty-string metadata cursor to the top-level one', () => {
    expect(
      parseRegistryPage({ servers: [], metadata: { nextCursor: '' }, cursor: 'abc' }).nextCursor
    ).toBe('abc')
  })

  it('reports a non-array servers field as no entries, cursor intact', () => {
    // The bot treats "0 entries but a nextCursor" as a fetch failure; that only
    // works if the cursor survives the shape that produces the empty list.
    const page = parseRegistryPage({ servers: null, metadata: { nextCursor: 'next' } })
    expect(page.entries).toEqual([])
    expect(page.nextCursor).toBe('next')
  })
})

describe('parseRegistryEntry (live fixture)', () => {
  const { entries } = parseRegistryPage(fixture)
  const parsed = entries.map(parseRegistryEntry)

  it('parses every live record and keys it on the bare registry name', () => {
    entries.forEach((e, i) => {
      const result = parsed[i]
      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') return
      expect(result.server.registryId.length).toBeGreaterThan(0)
      expect(result.server.registryId).toBe((e as { server: { name: string } }).server.name)
    })
  })

  it('maps the npm package of the record from issue #68', () => {
    const hit = parsed.find(
      r => r.kind === 'ok' && r.server.registryId === 'io.github.kaitoInfra/twitterapi-io-mcp-server'
    )
    expect(hit?.kind).toBe('ok')
    if (hit?.kind !== 'ok') return
    expect(hit.server.npmPackage).toBe('@kaitoinfra/twitterapi-io-mcp-server')
  })

  it('maps at least one package across the fixture (the schema-drift alarm)', () => {
    const mapped = parsed.filter(r => r.kind === 'ok' && r.server.hasMappedPackage).length
    expect(mapped).toBeGreaterThan(0)
  })

  it('never emits a null-bearing transport array, and maps every live type', () => {
    for (const r of parsed) {
      if (r.kind !== 'ok') continue
      expect(r.server.transports.length).toBeGreaterThan(0)
      for (const t of r.server.transports) {
        expect(TRANSPORTS).toContain(t)
      }
      // Live records must map cleanly; anything here is a transport rename.
      expect(r.server.unmappedTransports).toEqual([])
    }
  })
})

describe('parseRegistryEntry (defensive reads)', () => {
  it('survives every field arriving as the wrong type', () => {
    // These used to throw out of the per-entry call into the bot's fetch catch,
    // where one bad record reported a registry outage and wrote nothing.
    const result = parseRegistryEntry(
      entry({
        name: 'a/b',
        description: 42,
        version: { major: 1 },
        repository: { url: 123 },
        packages: {},
        remotes: {},
      })
    )
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.server.description).toBeNull()
    expect(result.server.githubUrl).toBeNull()
    expect(result.server.version).toBeNull()
    expect(result.server.npmPackage).toBeNull()
    expect(result.server.remoteUrls).toEqual([])
    // No remotes and no packages readable -> the genuine local-server shape.
    expect(result.server.transports).toEqual(['stdio'])
  })

  it('survives non-object members inside the packages and remotes lists', () => {
    const result = parseRegistryEntry(
      entry({ name: 'a/b', packages: [null, 'nope', { registryType: 'npm', identifier: 'x' }], remotes: [null, 7] })
    )
    expect(result.kind === 'ok' && result.server.npmPackage).toBe('x')
  })

  it('does not let a prototype-keyed transport reach the column', () => {
    const result = parseRegistryEntry(
      entry({ name: 'a/b', remotes: [{ type: 'constructor', url: 'https://x.test/mcp' }] })
    )
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.server.transports).toEqual([])
    expect(result.server.unmappedTransports).toEqual(['constructor'])
  })
})

describe('deriveTransports', () => {
  it('maps remote types to the stored vocabulary', () => {
    expect(deriveTransports({ remotes: [{ type: 'streamable-http' }] }).transports).toEqual(['http'])
    expect(deriveTransports({ remotes: [{ type: 'sse' }] }).transports).toEqual(['sse'])
  })

  it('reads stdio off packages[].transport.type', () => {
    expect(deriveTransports({ packages: [{ transport: { type: 'stdio' } }] }).transports).toEqual([
      'stdio',
    ])
  })

  it('unions remotes and packages, first-seen order', () => {
    expect(
      deriveTransports({
        remotes: [{ type: 'streamable-http' }],
        packages: [{ transport: { type: 'stdio' } }],
      }).transports
    ).toEqual(['http', 'stdio'])
  })

  it('defaults to stdio ONLY when nothing is declared', () => {
    expect(deriveTransports({}).transports).toEqual(['stdio'])
    expect(deriveTransports({ remotes: [], packages: [] }).transports).toEqual(['stdio'])
  })

  it('returns an empty set — never a fabricated stdio — when nothing maps', () => {
    // Claiming stdio for a remote-only server whose type upstream renamed would
    // hand it the +4 'stdio' = any(transport) compatibility point in both
    // scorers, inflating scores catalog-wide behind a passing drift guard.
    const remoteOnly = deriveTransports({ remotes: [{ type: 'websocket' }] })
    expect(remoteOnly.transports).toEqual([])
    expect(remoteOnly.unmapped).toEqual(['websocket'])

    const pkgOnly = deriveTransports({ packages: [{ transport: { type: 'quic' } }] })
    expect(pkgOnly.transports).toEqual([])
    expect(pkgOnly.unmapped).toEqual(['quic'])
  })

  it('does not resolve prototype keys into the transport array', () => {
    // A plain-object lookup answers 'constructor' with Object itself — truthy,
    // typed as Transport by the index signature, and stored as {NULL}.
    for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const out = deriveTransports({ remotes: [{ type }] })
      expect(out.transports).toEqual([])
      for (const t of out.transports) expect(TRANSPORTS).toContain(t)
    }
  })
})

describe('isIngestable', () => {
  it('skips superseded versions only on an explicit false', () => {
    expect(isIngestable({ isLatest: false })).toEqual({ ok: false, reason: 'not-latest' })
    expect(isIngestable({ isLatest: true })).toEqual({ ok: true })
    expect(isIngestable({})).toEqual({ ok: true })
  })

  it('skips only the statuses it recognizes as excluded', () => {
    expect(isIngestable({ status: 'deleted' })).toEqual({ ok: false, reason: 'inactive-status' })
    expect(isIngestable({ status: 'deprecated' })).toEqual({ ok: false, reason: 'inactive-status' })
    expect(isIngestable({ status: ' Deleted ' })).toEqual({ ok: false, reason: 'inactive-status' })
  })

  it('KEEPS an unrecognized status — a deny-list, not an allow-list', () => {
    // The allow-list this replaces (`status !== 'active'`) meant one upstream
    // rename of `active` would skip every record and red the run nightly until
    // a human shipped code. An unknown status must never empty the catalog.
    expect(isIngestable({ status: 'some-future-value' })).toEqual({ ok: true })
    expect(isIngestable({ status: 'published' })).toEqual({ ok: true })
    expect(isIngestable({ status: 'Active' })).toEqual({ ok: true })
    expect(isIngestable({ status: 'active' })).toEqual({ ok: true })
    expect(isIngestable({})).toEqual({ ok: true })
  })

  it('propagates the skip reason through parseRegistryEntry', () => {
    expect(parseRegistryEntry(entry({ name: 'a/b' }, { isLatest: false }))).toEqual({
      kind: 'skipped',
      reason: 'not-latest',
    })
    expect(parseRegistryEntry(entry({ name: 'a/b' }, { status: 'deleted' }))).toEqual({
      kind: 'skipped',
      reason: 'inactive-status',
    })
    expect(parseRegistryEntry(entry({ description: 'no name here' }))).toEqual({
      kind: 'skipped',
      reason: 'no-name',
    })
  })
})

describe('unwrapRegistryEntry', () => {
  it('accepts a bare server object as well as the wrapped form', () => {
    const bare = { name: 'a/b', version: '1.2.3' }
    expect(unwrapRegistryEntry(bare)).toEqual({ server: bare, meta: {} })
    expect(unwrapRegistryEntry(entry(bare)).server).toEqual(bare)

    const wrapped = parseRegistryEntry(entry(bare))
    const flat = parseRegistryEntry(bare)
    expect(flat).toEqual(wrapped)
  })

  it('does not throw on a non-object', () => {
    expect(unwrapRegistryEntry(null)).toEqual({ server: {}, meta: {} })
    expect(unwrapRegistryEntry('nope')).toEqual({ server: {}, meta: {} })
  })
})

describe('version', () => {
  it('reads the flat field and ignores the retired version_detail shape', () => {
    const flat = parseRegistryEntry(entry({ name: 'a/b', version: '2.0.1' }))
    expect(flat.kind === 'ok' && flat.server.version).toBe('2.0.1')

    const legacy = parseRegistryEntry(entry({ name: 'a/b', version_detail: { version: '9.9.9' } }))
    expect(legacy.kind === 'ok' && legacy.server.version).toBeNull()
  })
})
