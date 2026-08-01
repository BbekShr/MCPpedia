import { describe, it, expect } from 'vitest'
import { mergeScoresOnOsvFailure } from '../score-merge'
import type { FreshScoreInput, PreviousSecurityState } from '../score-merge'

/**
 * S34: when the OSV query fails, `scanSecurity` still returns a number — one
 * computed as if the package had no known CVEs. These cases pin which number
 * gets persisted, and on what evidence the choice is made.
 */

function fresh(overrides: Partial<FreshScoreInput> = {}): FreshScoreInput {
  return {
    scan_status: 'success',
    security_score: 0,
    other_score_total: 50,
    ...overrides,
  }
}

describe('mergeScoresOnOsvFailure', () => {
  it('keeps the stored security component when the OSV query failed', () => {
    const result = mergeScoresOnOsvFailure(
      { score_security: 25, last_security_scan: '2026-07-01T00:00:00.000Z' },
      fresh({ scan_status: 'failed', security_score: 0, other_score_total: 50 })
    )

    expect(result.score_security).toBe(25)
    expect(result.score_total).toBe(75)
    expect(result.osv_failed).toBe(true)
  })

  it('distinguishes "never scanned" by last_security_scan, not by the score value', () => {
    // `score_security` is `integer default 0` NOT NULL, so 0 is what a
    // never-scanned row reads as. Trusting it would pin a fresh import at 0/30
    // for as long as OSV stays down.
    const neverScanned = mergeScoresOnOsvFailure(
      { score_security: 0, last_security_scan: null },
      fresh({ scan_status: 'failed', security_score: 22, other_score_total: 50 })
    )
    expect(neverScanned.score_security).toBe(22)

    // Same stored 0, but this row HAS been scanned — the 0 is a real verdict
    // and must be preserved over the CVE-blind fresh 22.
    const scannedAndScoredZero = mergeScoresOnOsvFailure(
      { score_security: 0, last_security_scan: '2026-07-01T00:00:00.000Z' },
      fresh({ scan_status: 'failed', security_score: 22, other_score_total: 50 })
    )
    expect(scannedAndScoredZero.score_security).toBe(0)
  })

  it('lets the fresh score win on a successful scan even when the prior was higher', () => {
    const result = mergeScoresOnOsvFailure(
      { score_security: 28, last_security_scan: '2026-07-01T00:00:00.000Z' },
      fresh({ scan_status: 'success', security_score: 6, other_score_total: 50 })
    )

    expect(result.score_security).toBe(6)
    expect(result.score_total).toBe(56)
    expect(result.osv_failed).toBe(false)
  })

  it("treats 'pending' as a real result, not a failure", () => {
    // A package-less server scans 'pending' (lib/scoring.ts:777) and a
    // maintainer can null both package fields from the browser, so this state
    // is user-reachable — it must not silently resurrect an old component.
    const result = mergeScoresOnOsvFailure(
      { score_security: 28, last_security_scan: '2026-07-01T00:00:00.000Z' },
      fresh({ scan_status: 'pending', security_score: 12, other_score_total: 50 })
    )

    expect(result.score_security).toBe(12)
    expect(result.score_total).toBe(62)
    expect(result.osv_failed).toBe(false)
  })

  it('clamps the total to 100 when a preserved prior pushes the sum over', () => {
    const result = mergeScoresOnOsvFailure(
      { score_security: 30, last_security_scan: '2026-07-01T00:00:00.000Z' },
      fresh({ scan_status: 'failed', security_score: 0, other_score_total: 85 })
    )

    expect(result.score_security).toBe(30)
    expect(result.score_total).toBe(100)
  })

  it('floors the total at 0', () => {
    const result = mergeScoresOnOsvFailure(
      null,
      fresh({ scan_status: 'success', security_score: -5, other_score_total: -10 })
    )

    expect(result.score_total).toBe(0)
  })

  it('ignores security_scan_status entirely — the predicate is last_security_scan', () => {
    // All three writers stamp `security_scan_status` on EVERY run, failures
    // included (lib/score-merge.ts:47-53), so a status-based predicate erases
    // itself on the second consecutive failure. Adding the column to the prior
    // must change nothing, whatever its value.
    const base = { score_security: 25, last_security_scan: '2026-07-01T00:00:00.000Z' }
    const input = fresh({ scan_status: 'failed', security_score: 0, other_score_total: 50 })

    const withoutStatus = mergeScoresOnOsvFailure(base, input)
    for (const status of ['failed', 'success', 'pending']) {
      const withStatus: PreviousSecurityState & { security_scan_status: string } = {
        ...base,
        security_scan_status: status,
      }
      expect(mergeScoresOnOsvFailure(withStatus, input)).toEqual(withoutStatus)
    }
    expect(withoutStatus.score_security).toBe(25)
  })

  it('falls back to the fresh score when there is no prior row at all', () => {
    for (const previous of [null, undefined, {}]) {
      const result = mergeScoresOnOsvFailure(
        previous,
        fresh({ scan_status: 'failed', security_score: 18, other_score_total: 50 })
      )
      expect(result.score_security).toBe(18)
      expect(result.osv_failed).toBe(true)
    }
  })
})
