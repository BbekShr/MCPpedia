import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createRouteSupabaseHarness } from '../../__tests__/helpers/route-supabase-stub'
import {
  buildEditsQuery,
  matchesEditFilter,
  EDITS_SELECT,
  EDIT_STATUS_FILTERS,
  PENDING_EDIT_STATUS,
} from '../admin-edits'

const harness = createRouteSupabaseHarness()

beforeEach(() => harness.reset())

// Shape pins: these prove the calls were made, not that they filter anything.
describe('buildEditsQuery call shape (pins)', () => {
  it('pending: select, eq status, order, limit', async () => {
    await buildEditsQuery(await harness.createClient(), 'pending')
    expect(harness.calls).toEqual([
      { table: 'edits', op: 'select', args: [EDITS_SELECT] },
      { table: 'edits', op: 'eq', args: ['status', 'pending'] },
      { table: 'edits', op: 'order', args: ['created_at', { ascending: false }] },
      { table: 'edits', op: 'limit', args: [50] },
    ])
  })

  it('all: no status filter', async () => {
    await buildEditsQuery(await harness.createClient(), 'all')
    expect(harness.calls.some(c => c.op === 'eq')).toBe(false)
  })

  it('pending status constant', () => {
    expect(PENDING_EDIT_STATUS).toBe('pending')
  })
})

describe('matchesEditFilter', () => {
  it.each(EDIT_STATUS_FILTERS.flatMap(f => (['pending', 'approved', 'rejected'] as const).map(s => [f, s] as const)))(
    'filter %s vs status %s',
    (filter, status) => {
      expect(matchesEditFilter(status, filter)).toBe(filter === 'all' || filter === status)
    },
  )
})

// Behavioural fake: actually filters, sorts and slices, so the 50-row window
// eviction that S73 fixed is observable.
type Row = { id: number; status: string; created_at: string }
function fakeClient(rows: Row[]) {
  return {
    from: () => {
      let data = [...rows]
      const b = {
        select: () => b,
        eq: (col: string, v: unknown) => { data = data.filter(r => (r as Record<string, unknown>)[col] === v); return b },
        order: (col: string, { ascending }: { ascending: boolean }) => {
          const k = col as keyof Row
          data = [...data].sort((x, y) => (x[k] < y[k] ? -1 : x[k] > y[k] ? 1 : 0) * (ascending ? 1 : -1))
          return b
        },
        limit: (n: number) => { data = data.slice(0, n); return b },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      }
      return b
    },
  } as unknown as SupabaseClient
}

describe('buildEditsQuery behaviour (fake client)', () => {
  const rows: Row[] = [
    { id: 0, status: 'pending', created_at: '2026-01-01T00:00:00Z' },
    ...Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      status: 'approved',
      created_at: `2026-02-01T00:${String(i).padStart(2, '0')}:00Z`,
    })),
  ]

  it('pending filter returns the old pending row despite 60 newer approved rows', async () => {
    const { data } = await buildEditsQuery(fakeClient(rows), 'pending')
    expect(data).toEqual([rows[0]])
  })

  it('all filter returns a 50-row window with no pending row', async () => {
    const { data } = await buildEditsQuery(fakeClient(rows), 'all')
    expect(data).toHaveLength(50)
    expect((data as Row[]).some(r => r.status === 'pending')).toBe(false)
  })
})
