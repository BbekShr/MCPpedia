import { describe, it, expect } from 'vitest'
import {
  computeCVSS3BaseScore,
  parseCVSSScore,
  cvssToSeverity,
} from '../scoring'

// The Security score (0–30 of the 0–100 total) leans on the CVE-penalty path,
// which multiplies advisory counts by severity derived from these base scores.
// A single wrong coefficient silently mis-grades every server with a CVE, so the
// engine is pinned here against official CVSS 3.1 reference vectors — expected
// base scores taken from the FIRST.org calculator (first.org/cvss/calculator/3.1).

describe('computeCVSS3BaseScore — official CVSS 3.1 reference vectors', () => {
  const cases: Array<[string, number]> = [
    // Full network compromise, scope unchanged (e.g. RCE)
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
    // Same but scope changed (e.g. Log4Shell CVE-2021-44228) → maxes out
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0],
    // Typical local privilege escalation
    ['CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 7.8],
    // Network DoS — availability only
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 7.5],
    // Low confidentiality info leak
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N', 5.3],
    // No impact at all → zero
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0.0],
  ]

  it.each(cases)('%s → %f', (vector, expected) => {
    expect(computeCVSS3BaseScore(vector)).toBe(expected)
  })

  it('accepts the CVSS:3.0 prefix as well as 3.1', () => {
    expect(computeCVSS3BaseScore('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8)
  })

  it('returns null for a vector missing required metrics', () => {
    // No scope (S) and no impact metrics → cannot compute
    expect(computeCVSS3BaseScore('CVSS:3.1/AV:N/AC:L')).toBeNull()
  })

  it('returns null for an unknown metric value', () => {
    expect(computeCVSS3BaseScore('CVSS:3.1/AV:Z/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull()
  })
})

describe('parseCVSSScore', () => {
  it('passes through a plain numeric score when OSV omits the vector', () => {
    expect(parseCVSSScore([{ type: 'CVSS_V3', score: '7.5' }])).toBe(7.5)
  })

  it('computes the base score from a CVSS vector string', () => {
    expect(
      parseCVSSScore([{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }]),
    ).toBe(9.8)
  })

  it('prefers a CVSS_V3/V4 entry over other severity types', () => {
    expect(
      parseCVSSScore([
        { type: 'SOMETHING_ELSE', score: '1.0' },
        { type: 'CVSS_V3', score: '9.8' },
      ]),
    ).toBe(9.8)
  })

  it('returns null for empty / missing / unparseable severity arrays', () => {
    expect(parseCVSSScore(undefined)).toBeNull()
    expect(parseCVSSScore([])).toBeNull()
    expect(parseCVSSScore([{ type: 'CVSS_V3', score: 'not-a-score' }])).toBeNull()
  })
})

describe('cvssToSeverity — band boundaries', () => {
  it.each([
    [null, 'info'],
    [0.0, 'info'],
    [0.1, 'low'],
    [3.9, 'low'],
    [4.0, 'medium'],
    [6.9, 'medium'],
    [7.0, 'high'],
    [8.9, 'high'],
    [9.0, 'critical'],
    [10.0, 'critical'],
  ] as Array<[number | null, string]>)('%s → %s', (score, expected) => {
    expect(cvssToSeverity(score)).toBe(expected)
  })
})
