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

  it('never emits an empty or null-bearing transport array', () => {
    for (const r of parsed) {
      if (r.kind !== 'ok') continue
      expect(r.server.transports.length).toBeGreaterThan(0)
      for (const t of r.server.transports) {
        expect(TRANSPORTS).toContain(t)
      }
    }
  })
})

describe('deriveTransports', () => {
  it('maps remote types to the stored vocabulary', () => {
    expect(deriveTransports({ remotes: [{ type: 'streamable-http' }] })).toEqual(['http'])
    expect(deriveTransports({ remotes: [{ type: 'sse' }] })).toEqual(['sse'])
  })

  it('reads stdio off packages[].transport.type', () => {
    expect(deriveTransports({ packages: [{ transport: { type: 'stdio' } }] })).toEqual(['stdio'])
  })

  it('unions remotes and packages, first-seen order', () => {
    expect(
      deriveTransports({
        remotes: [{ type: 'streamable-http' }],
        packages: [{ transport: { type: 'stdio' } }],
      })
    ).toEqual(['http', 'stdio'])
  })

  it('drops transports the catalog cannot express, and defaults to stdio', () => {
    expect(deriveTransports({ remotes: [{ type: 'websocket' }] })).toEqual(['stdio'])
    expect(deriveTransports({})).toEqual(['stdio'])
  })
})

describe('isIngestable', () => {
  it('skips superseded versions only on an explicit false', () => {
    expect(isIngestable({ isLatest: false })).toEqual({ ok: false, reason: 'not-latest' })
    expect(isIngestable({ isLatest: true })).toEqual({ ok: true })
    expect(isIngestable({})).toEqual({ ok: true })
  })

  it('skips any status it recognizes as non-active, but never an absent one', () => {
    expect(isIngestable({ status: 'deleted' })).toEqual({ ok: false, reason: 'inactive-status' })
    expect(isIngestable({ status: 'some-future-value' })).toEqual({
      ok: false,
      reason: 'inactive-status',
    })
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
