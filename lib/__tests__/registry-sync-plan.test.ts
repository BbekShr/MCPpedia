import { describe, it, expect, vi } from 'vitest'
import { planRegistryRowWrite, type PlanRegistryRowInput } from '../registry-sync-plan'
import { normalizeGithubUrl } from '../normalize'

const A = 'https://github.com/acme/thing'
const B = 'https://github.com/newco/thing'

/** Plan one entry against a fake catalog: the URLs live rows hold, by row id. */
function plan(
  input: Partial<PlanRegistryRowInput> & { catalog?: Record<string, string> }
) {
  const catalog = input.catalog ?? {}
  const githubUrl = input.githubUrl ?? null
  const findRowByUrl = vi.fn(async (url: string) => {
    const hit = Object.entries(catalog).find(([, u]) => normalizeGithubUrl(u) === url)
    return hit ? { id: hit[0] } : null
  })
  const promise = planRegistryRowWrite({
    githubUrl,
    existingRow: input.existingRow,
    urlInCatalog:
      input.urlInCatalog ??
      Object.values(catalog).some(u => normalizeGithubUrl(u) === githubUrl),
    normalizeUrl: normalizeGithubUrl,
    findRowByUrl: input.findRowByUrl ?? findRowByUrl,
  })
  return Object.assign(promise, { findRowByUrl })
}

describe('planRegistryRowWrite — a known registry_id never reaches the insert', () => {
  it('adopts a newly published repository URL onto the row we already own', async () => {
    // The regression this exists for: a registry entry published WITHOUT
    // `repository` imports with github_url NULL. The day the publisher adds one,
    // the URL is new to the catalog and the row's is NULL, so neither the fast
    // path nor the URL link branch fired and the entry fell through to INSERT —
    // forging a second live row for a server we already had, nightly, with no
    // 23505 to catch it (`servers.registry_id` has no unique index).
    const result = await plan({
      githubUrl: B,
      existingRow: { id: 'row-a', githubUrl: null },
      catalog: {}, // B is not held by any other row
    })
    expect(result).toEqual({ kind: 'adopt', id: 'row-a', githubUrl: B })
  })

  it('never plans an insert while a row is keyed by this registry_id', async () => {
    const urls = [null, A, B]
    for (const entryUrl of urls) {
      for (const rowUrl of urls) {
        const catalogs: Record<string, string>[] = [{}, { 'row-a': A }, { 'row-k': B }, { 'row-k': A }]
        for (const catalog of catalogs) {
          const result = await plan({
            githubUrl: entryUrl,
            existingRow: { id: 'row-a', githubUrl: rowUrl },
            catalog,
          })
          expect(result.kind).not.toBe('insert')
        }
        // Also with the URL believed present but no row matching it exactly.
        const missed = await plan({
          githubUrl: entryUrl,
          existingRow: { id: 'row-a', githubUrl: rowUrl },
          urlInCatalog: true,
          findRowByUrl: async () => null,
        })
        expect(missed.kind).not.toBe('insert')
      }
    }
  })

  it('refreshes when the row already carries the entry URL, or the entry has none', async () => {
    expect(await plan({ githubUrl: A, existingRow: { id: 'row-a', githubUrl: A } })).toEqual({
      kind: 'refresh',
      id: 'row-a',
    })
    // An un-normalized stored form is the same row, not a transfer.
    expect(
      await plan({ githubUrl: A, existingRow: { id: 'row-a', githubUrl: `${A}.git` } })
    ).toEqual({ kind: 'refresh', id: 'row-a' })
    expect(await plan({ githubUrl: null, existingRow: { id: 'row-a', githubUrl: A } })).toEqual({
      kind: 'refresh',
      id: 'row-a',
    })
  })

  it('takes the fast path without paying the catalog-wide URL lookup', async () => {
    // The lookup behind `findRowByUrl` is an `ilike` scan of ~63k rows. Nearly
    // every entry on nearly every night is already synced, so the fast path
    // must return before it — an eager lookup would add that scan per entry.
    for (const existing of [{ id: 'row-a', githubUrl: A }, { id: 'row-a', githubUrl: null }]) {
      const result = plan({
        githubUrl: existing.githubUrl ? A : null,
        existingRow: existing,
        catalog: { 'row-a': A },
      })
      expect((await result).kind).toBe('refresh')
      expect(result.findRowByUrl).not.toHaveBeenCalled()
    }
  })
})

describe('planRegistryRowWrite — repo transfers', () => {
  it('moves the identity to the row holding the new URL AND clears the old one', async () => {
    // Leaving registry_id on both rows lets the next run's `new Map(...)` pick
    // the stale one back up by UUID order and re-link forever.
    expect(
      await plan({
        githubUrl: B,
        existingRow: { id: 'row-a', githubUrl: A },
        catalog: { 'row-k': B },
      })
    ).toEqual({ kind: 'relink', targetId: 'row-k', clearRegistryIdOn: 'row-a' })
  })

  it('has nothing to clear when no row was keyed by the registry_id yet', async () => {
    expect(await plan({ githubUrl: B, catalog: { 'row-k': B } })).toEqual({
      kind: 'relink',
      targetId: 'row-k',
      clearRegistryIdOn: null,
    })
  })

  it('refreshes rather than relinking to itself', async () => {
    // The stored form differs but resolves back to our own row.
    expect(
      await plan({
        githubUrl: B,
        existingRow: { id: 'row-a', githubUrl: A },
        urlInCatalog: true,
        findRowByUrl: async () => ({ id: 'row-a' }),
      })
    ).toEqual({ kind: 'refresh', id: 'row-a' })
  })

  it('restamps but does NOT write a URL the catalog claims is already taken', async () => {
    // Writing it anyway would forge a second live row for one repo.
    expect(
      await plan({
        githubUrl: B,
        existingRow: { id: 'row-a', githubUrl: A },
        urlInCatalog: true,
        findRowByUrl: async () => null,
      })
    ).toEqual({ kind: 'linkMiss', refreshId: 'row-a' })
  })
})

describe('planRegistryRowWrite — genuinely new servers', () => {
  it('inserts only when nothing identifies the entry', async () => {
    expect(await plan({ githubUrl: B, catalog: { 'row-k': A } })).toEqual({ kind: 'insert' })
    expect(await plan({ githubUrl: null })).toEqual({ kind: 'insert' })
  })

  it('counts a link miss instead of inserting when the URL is believed present', async () => {
    expect(
      await plan({ githubUrl: B, urlInCatalog: true, findRowByUrl: async () => null })
    ).toEqual({ kind: 'linkMiss', refreshId: null })
  })
})
