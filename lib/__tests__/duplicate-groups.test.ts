import { describe, it, expect } from 'vitest'
import { buildDuplicateGroups, MONOREPO_URLS } from '../duplicate-groups'
import { normalizeGithubUrl } from '../normalize'

const row = (id: string, github_url: string, extra: Record<string, unknown> = {}) =>
  ({ id, github_url, ...extra })

describe('buildDuplicateGroups', () => {
  // S32: `fetchAllRows` paginates by offset, so without a unique tiebreak in the
  // caller's `.order()` one row can be returned twice and land in its own
  // "duplicate group" — where it is both keeper and dupe, and the bot archives
  // the live listing. Returning ZERO groups here means the archive loop at
  // bots/detect-duplicates.ts:221-263 is never entered at all, i.e. zero
  // `is_archived: true` writes. The `dupe.id === keep.id` guard at
  // detect-duplicates.ts:224-226 is a SECOND, independent layer in front of that
  // write and is deliberately NOT exercised by this test.
  it('returns nothing when the same id appears twice under one url', () => {
    const groups = buildDuplicateGroups([
      row('srv-1', 'https://github.com/o/r'),
      row('srv-1', 'https://github.com/o/r'),
    ])
    expect(groups).toEqual([])
  })

  it('keeps the FIRST element of a group with two distinct ids', () => {
    // The keeper rule lives entirely in the caller's SQL ORDER BY
    // (data_quality desc, id asc) — this helper must never re-sort, so 'srv-b'
    // stays the keeper despite sorting after 'srv-a'.
    const groups = buildDuplicateGroups([
      row('srv-b', 'https://github.com/o/r'),
      row('srv-a', 'HTTPS://GitHub.com/o/r/'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].url).toBe('https://github.com/o/r')
    expect(groups[0].keep.id).toBe('srv-b')
    expect(groups[0].dupes.map(d => d.id)).toEqual(['srv-a'])
  })

  it('skips a known monorepo even when its url arrives de-normalized', () => {
    // Note `.git/` is deliberately absent: normalizeGithubUrl strips `.git`
    // BEFORE trailing slashes (lib/normalize.ts:6-8), so `…/servers.git/`
    // normalizes to `…/servers.git` and correctly does NOT match.
    const groups = buildDuplicateGroups([
      row('srv-1', 'HTTP://GitHub.com/ModelContextProtocol/Servers/'),
      row('srv-2', 'https://github.com/modelcontextprotocol/servers.git'),
      row('srv-3', 'https://github.com/modelcontextprotocol/servers'),
    ])
    expect(groups).toEqual([])
  })

  it('skips rows with no github_url', () => {
    const groups = buildDuplicateGroups([
      row('srv-1', null as unknown as string),
      row('srv-2', undefined as unknown as string),
      row('srv-3', '   '),
    ])
    expect(groups).toEqual([])
  })

  // Negative invariant: every literal in the list is already normalized today,
  // which makes the `.map(normalizeGithubUrl)` in duplicate-groups.ts a
  // present-day NO-OP — dropping it would be invisible to every case above
  // while silently disarming the skip for the first future entry pasted with
  // mixed case, `http://`, a trailing slash or a `.git` suffix.
  it('stores every monorepo url in already-normalized form', () => {
    for (const url of MONOREPO_URLS) {
      expect(normalizeGithubUrl(url)).toBe(url)
    }
  })
})
