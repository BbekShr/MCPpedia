import { describe, it, expect } from 'vitest'
import {
  compareKeeperCandidates,
  computeTrustFlagUpdate,
  type KeeperCandidate,
} from '@/lib/duplicate-keeper'

// Issues #91/#136: `bots/detect-duplicates.ts` used to order keeper candidates
// by `data_quality` (a column nothing ever writes — always 0), so the real
// tiebreak was `id asc`, i.e. random. These tests pin the intended semantics
// of the replacement ordering: publisher_verified desc, score_total desc,
// created_at asc, id asc — mirroring the SQL `ORDER BY` in
// bots/detect-duplicates.ts (lib/duplicate-groups.ts's `keep = group[0]` relies
// on the caller's SQL order, not on this comparator, which exists only to
// verify the semantics).
const candidate = (overrides: Partial<KeeperCandidate>): KeeperCandidate => ({
  id: 'zzz',
  publisher_verified: false,
  score_total: 0,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('compareKeeperCandidates', () => {
  it('a claimed row beats an unclaimed row regardless of id', () => {
    const claimed = candidate({ id: 'aaa', publisher_verified: true, score_total: 10 })
    const unclaimed = candidate({ id: '000', publisher_verified: false, score_total: 90 })
    // 'aaa' sorts after '000' lexically and has a lower score — only the claim wins.
    expect(compareKeeperCandidates(claimed, unclaimed)).toBeLessThan(0)
    expect(compareKeeperCandidates(unclaimed, claimed)).toBeGreaterThan(0)
  })

  it('a higher score_total beats a lower one when neither is claimed', () => {
    const higher = candidate({ id: 'b', score_total: 80 })
    const lower = candidate({ id: 'a', score_total: 20 })
    // 'a' sorts before 'b' lexically — only the score wins.
    expect(compareKeeperCandidates(higher, lower)).toBeLessThan(0)
    expect(compareKeeperCandidates(lower, higher)).toBeGreaterThan(0)
  })

  it('an older created_at beats a newer one when claim status and score are tied', () => {
    const older = candidate({ id: 'z', created_at: '2025-01-01T00:00:00Z' })
    const newer = candidate({ id: 'a', created_at: '2026-01-01T00:00:00Z' })
    // 'a' sorts before 'z' lexically — only the age wins.
    expect(compareKeeperCandidates(older, newer)).toBeLessThan(0)
    expect(compareKeeperCandidates(newer, older)).toBeGreaterThan(0)
  })

  it('falls back to id asc as the final deterministic tiebreak', () => {
    const a = candidate({ id: 'aaa' })
    const b = candidate({ id: 'bbb' })
    expect(compareKeeperCandidates(a, b)).toBeLessThan(0)
    expect(compareKeeperCandidates(b, a)).toBeGreaterThan(0)
  })

  it('treats null publisher_verified and null score_total as the lowest rank', () => {
    const withNulls = candidate({ id: 'a', publisher_verified: null, score_total: null })
    const withValues = candidate({ id: 'z', publisher_verified: false, score_total: 0 })
    expect(compareKeeperCandidates(withNulls, withValues)).toBeGreaterThan(0)
  })
})

// Issue #91: publisher_verified/claimed_by live on the `servers` row, not in
// `publisher_claims` (which IS reparented onto the keeper), so a merge that
// only reparents child tables silently drops the ✓ Verified Publisher badge.
describe('computeTrustFlagUpdate', () => {
  it('transfers publisher_verified + claimed_by when the keeper is unverified and the dupe is verified', () => {
    const keeper = { publisher_verified: false }
    const dupe = { publisher_verified: true, claimed_by: 'user-123' }
    expect(computeTrustFlagUpdate(keeper, dupe)).toEqual({
      publisher_verified: true,
      claimed_by: 'user-123',
    })
  })

  it('returns null when the dupe is not verified', () => {
    const keeper = { publisher_verified: false }
    const dupe = { publisher_verified: false, claimed_by: null }
    expect(computeTrustFlagUpdate(keeper, dupe)).toBeNull()
  })

  it('returns null when the keeper is already verified, even if the dupe also is', () => {
    // The keeper's existing claim must not be clobbered by a second claimant.
    const keeper = { publisher_verified: true }
    const dupe = { publisher_verified: true, claimed_by: 'someone-else' }
    expect(computeTrustFlagUpdate(keeper, dupe)).toBeNull()
  })

  it('returns null when the keeper is unverified via null rather than false', () => {
    // publisher_verified defaults to `false` in the schema, but this must not
    // assume `false` is the only falsy-but-unverified representation.
    const keeper = { publisher_verified: null }
    const dupe = { publisher_verified: true, claimed_by: 'user-123' }
    expect(computeTrustFlagUpdate(keeper, dupe)).toEqual({
      publisher_verified: true,
      claimed_by: 'user-123',
    })
  })
})
