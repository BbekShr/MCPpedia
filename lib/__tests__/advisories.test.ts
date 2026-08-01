import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectStaleAdvisoryIds, reconcileAdvisories } from '../advisories'
import type { OpenAdvisoryRow } from '../advisories'
import type { Advisory } from '../scoring'

function advisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    cve_id: 'CVE-2026-1',
    severity: 'high',
    cvss_score: 7.5,
    title: 'Example advisory',
    description: 'desc',
    affected_versions: '<1.2.3',
    fixed_version: '1.2.3',
    source_url: 'https://osv.dev/GHSA-xxxx',
    status: 'open',
    published_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('selectStaleAdvisoryIds', () => {
  it('closes every open row when the fresh scan reports NO advisories', () => {
    // The empty-advisory case is the reconciliation signal (package cleared, or
    // OSV withdrew the entry), not a no-op.
    const rows: OpenAdvisoryRow[] = [
      { id: 'a1', cve_id: 'CVE-2026-1' },
      { id: 'a2', cve_id: 'GHSA-yyyy' },
    ]
    expect(selectStaleAdvisoryIds(rows, [])).toEqual(['a1', 'a2'])
  })

  it('never closes a row with a null cve_id, even against an empty fresh list', () => {
    const rows: OpenAdvisoryRow[] = [
      { id: 'a1', cve_id: null },
      { id: 'a2', cve_id: 'CVE-2026-1' },
    ]
    expect(selectStaleAdvisoryIds(rows, [])).toEqual(['a2'])
  })

  it('retains a row the fresh scan re-confirms', () => {
    const rows: OpenAdvisoryRow[] = [
      { id: 'a1', cve_id: 'CVE-2026-1' },
      { id: 'a2', cve_id: 'CVE-2026-2' },
    ]
    expect(selectStaleAdvisoryIds(rows, [advisory({ cve_id: 'CVE-2026-1' })])).toEqual(['a2'])
  })

  it('closes the GHSA-keyed row when OSV attaches a CVE alias (alias drift)', () => {
    const rows: OpenAdvisoryRow[] = [{ id: 'a1', cve_id: 'GHSA-xxxx' }]
    expect(selectStaleAdvisoryIds(rows, [advisory({ cve_id: 'CVE-2026-1' })])).toEqual(['a1'])
  })

  it('returns nothing for null, undefined or empty open rows', () => {
    expect(selectStaleAdvisoryIds(null, [])).toEqual([])
    expect(selectStaleAdvisoryIds(undefined, [])).toEqual([])
    expect(selectStaleAdvisoryIds([], [advisory()])).toEqual([])
  })

  it('ignores fresh advisories with a falsy cve_id — they shield nothing', () => {
    const rows: OpenAdvisoryRow[] = [{ id: 'a1', cve_id: 'CVE-2026-1' }]
    expect(selectStaleAdvisoryIds(rows, [advisory({ cve_id: null }), advisory({ cve_id: '' })]))
      .toEqual(['a1'])
  })
})

type Call = { table: string; op: string; args: unknown[] }

/**
 * Minimal thenable PostgREST-shaped stub: builder methods chain, and awaiting
 * the builder resolves whatever the test queued for the read.
 */
function makeStubClient(options: {
  openRows?: OpenAdvisoryRow[]
  readError?: { message: string }
  throwOn?: string
} = {}) {
  const calls: Call[] = []

  const builder = {
    _table: '',
    from(table: string) {
      this._table = table
      return this
    },
    upsert(...args: unknown[]) {
      if (options.throwOn === 'upsert') throw new Error('boom')
      calls.push({ table: this._table, op: 'upsert', args })
      return this
    },
    select(...args: unknown[]) {
      calls.push({ table: this._table, op: 'select', args })
      return this
    },
    update(...args: unknown[]) {
      calls.push({ table: this._table, op: 'update', args })
      return this
    },
    eq(...args: unknown[]) {
      calls.push({ table: this._table, op: 'eq', args })
      return this
    },
    in(...args: unknown[]) {
      calls.push({ table: this._table, op: 'in', args })
      return this
    },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(
        options.readError
          ? { data: null, error: options.readError }
          : { data: options.openRows ?? [], error: null }
      ).then(resolve)
    },
  }

  return { client: builder as unknown as SupabaseClient, calls }
}

describe('reconcileAdvisories', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("never reads or closes when the scan status is 'failed'", async () => {
    const { client, calls } = makeStubClient({ openRows: [{ id: 'a1', cve_id: 'CVE-OLD' }] })
    await reconcileAdvisories(client, 'srv-1', [], 'failed')
    expect(calls.filter(c => c.op === 'select')).toHaveLength(0)
    expect(calls.filter(c => c.op === 'update')).toHaveLength(0)
  })

  it("closes stale rows on a 'pending' scan with no advisories", async () => {
    const { client, calls } = makeStubClient({
      openRows: [{ id: 'a1', cve_id: 'CVE-OLD' }, { id: 'a2', cve_id: 'CVE-GONE' }],
    })
    await reconcileAdvisories(client, 'srv-1', [], 'pending')
    expect(calls).toContainEqual({
      table: 'security_advisories',
      op: 'update',
      args: [{ status: 'fixed' }],
    })
    expect(calls).toContainEqual({
      table: 'security_advisories',
      op: 'in',
      args: ['id', ['a1', 'a2']],
    })
  })

  it('upserts the full advisory payload on the (server_id, cve_id) conflict key', async () => {
    const { client, calls } = makeStubClient()
    await reconcileAdvisories(client, 'srv-1', [advisory()], 'success')

    const upsert = calls.find(c => c.op === 'upsert')
    expect(upsert).toBeDefined()
    const [payload, opts] = upsert!.args as [Record<string, unknown>, unknown]
    expect(Object.keys(payload).sort()).toEqual([
      'affected_versions', 'cve_id', 'cvss_score', 'description', 'fixed_version',
      'published_at', 'server_id', 'severity', 'source_url', 'status', 'title',
    ])
    expect(payload.server_id).toBe('srv-1')
    expect(payload.cve_id).toBe('CVE-2026-1')
    expect(opts).toEqual({ onConflict: 'server_id,cve_id', ignoreDuplicates: false })
  })

  it('returns quietly when the open-advisory read errors', async () => {
    const { client, calls } = makeStubClient({ readError: { message: 'read failed' } })
    await expect(reconcileAdvisories(client, 'srv-1', [], 'success')).resolves.toBeUndefined()
    expect(calls.filter(c => c.op === 'update')).toHaveLength(0)
  })

  it('returns quietly when the client throws', async () => {
    const { client } = makeStubClient({ throwOn: 'upsert' })
    await expect(reconcileAdvisories(client, 'srv-1', [advisory()], 'success'))
      .resolves.toBeUndefined()
  })
})
