import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  computeCVSS3BaseScore,
  parseCVSSScore,
  cvssToSeverity,
  cvss4VectorSeverity,
  rateOSVSeverity,
  scanSecurity,
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

// CVSS 4.0 vectors carry no C/I/A metrics, so the 3.x formula cannot score them.
// They are banded instead (cvss4VectorSeverity) — no exact base score is claimed,
// but a v4 critical must never land in the unpenalized 'info' bucket.
describe('cvss4VectorSeverity — CVSS 4.0 vectors', () => {
  it('bands a fully-remote total compromise as critical', () => {
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'),
    ).toBe('critical')
  })

  it('bands high impact behind privileges or local access as high', () => {
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'),
    ).toBe('high')
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:P/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'),
    ).toBe('high')
  })

  it('counts subsequent-system impact, not just the vulnerable system', () => {
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:H/SI:H/SA:H'),
    ).toBe('critical')
  })

  it('bands low impact by reachability', () => {
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N'),
    ).toBe('medium')
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:P/AC:H/AT:P/PR:H/UI:A/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N'),
    ).toBe('low')
  })

  it('bands a zero-impact vector as info', () => {
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N'),
    ).toBe('info')
  })

  it('returns null for non-v4 vectors and for v4 vectors missing impact metrics', () => {
    expect(cvss4VectorSeverity('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull()
    expect(cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N')).toBeNull()
  })
})

describe('parseCVSSScore — vector preference', () => {
  it('returns the v3 base score even when CVSS_V4 is listed first', () => {
    expect(
      parseCVSSScore([
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N' },
        { type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' },
      ]),
    ).toBe(9.8)
  })

  it('skips an unparseable v3 entry in favour of a later parseable one', () => {
    expect(
      parseCVSSScore([
        { type: 'CVSS_V3', score: 'not-a-score' },
        { type: 'CVSS_V3', score: '7.5' },
      ]),
    ).toBe(7.5)
  })

  it('still returns null for a v4-only vector — no v4 base score is invented', () => {
    expect(
      parseCVSSScore([
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N' },
      ]),
    ).toBeNull()
  })
})

describe('rateOSVSeverity', () => {
  it('rates a v4-only advisory by band, with no invented score', () => {
    expect(
      rateOSVSeverity([
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N' },
      ]),
    ).toEqual({ cvss_score: null, severity: 'critical' })
  })

  it('marks an advisory with no severity data as unrated (null score + info)', () => {
    expect(rateOSVSeverity(undefined)).toEqual({ cvss_score: null, severity: 'info' })
    expect(rateOSVSeverity([{ type: 'CVSS_V2', score: 'AV:N/AC:L/Au:N/C:P/I:P/A:P' }]))
      .toEqual({ cvss_score: null, severity: 'info' })
  })

  it('keeps the computed score for a rated advisory', () => {
    expect(rateOSVSeverity([{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }]))
      .toEqual({ cvss_score: 9.8, severity: 'critical' })
  })
})

// End-to-end through scanSecurity: the CVE evidence is where an unrated advisory used
// to cost nothing at all — full 15/15 while the detail line read "N open CVE(s)".
describe('CVE penalty — open advisories always cost something', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // OSV is the only fetch we answer; deps.dev is left to fail, which the dependency
  // health check already handles ("Could not reach deps.dev").
  function stubOSV(vulns: unknown[]) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).includes('api.osv.dev')) {
        return { ok: true, json: async () => ({ vulns }) } as Response
      }
      throw new Error('network disabled in tests')
    })
  }

  // An open advisory has no "fixed" event in its affected ranges.
  function openVuln(id: string, severity?: Array<{ type: string; score: string }>) {
    return {
      id,
      summary: `${id} summary`,
      severity,
      affected: [{
        package: { name: 'evil-pkg', ecosystem: 'npm' },
        ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }],
      }],
    }
  }

  async function cveEvidence(vulns: unknown[]) {
    stubOSV(vulns)
    const result = await scanSecurity('evil-pkg', null, false, 'MIT', false, false, [])
    return { result, cve: result.evidence.find(e => e.id === 'cve')! }
  }

  it('penalizes three CVSS-4.0-only criticals instead of scoring them 15/15', async () => {
    const v4Critical = [{
      type: 'CVSS_V4',
      score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N',
    }]
    const { result, cve } = await cveEvidence([
      openVuln('GHSA-v4-1', v4Critical),
      openVuln('GHSA-v4-2', v4Critical),
      openVuln('GHSA-v4-3', v4Critical),
    ])

    expect(result.cve_count).toBe(3)
    expect(result.advisories.map(a => a.severity)).toEqual(['critical', 'critical', 'critical'])
    expect(cve.points).toBeLessThan(15)
    expect(cve.points).toBe(0) // 3 × 5, capped at 15
    expect(cve.pass).toBe(false)
    expect(cve.detail).toContain('3 critical/high')
  })

  it('penalizes an open advisory that carries no severity array at all', async () => {
    const { cve } = await cveEvidence([openVuln('GHSA-no-severity')])

    expect(cve.points).toBeLessThan(15)
    expect(cve.points).toBe(12) // unrated → medium weight
    expect(cve.detail).toContain('1 unrated')
    expect(cve.detail).toContain('1 open CVE(s)')
  })

  it('caps the penalty at 15 no matter how many unrated advisories pile up', async () => {
    const { cve } = await cveEvidence(
      Array.from({ length: 12 }, (_, i) => openVuln(`GHSA-unrated-${i}`)),
    )

    expect(cve.points).toBe(0)
  })

  it('does not penalize a clean package — still exactly 15/15', async () => {
    const { cve } = await cveEvidence([])

    expect(cve.points).toBe(15)
    expect(cve.pass).toBe(true)
    expect(cve.detail).toContain('No known CVEs')
  })

  it('does not penalize an advisory that is already fixed', async () => {
    stubOSV([{
      id: 'GHSA-fixed',
      summary: 'fixed already',
      affected: [{
        package: { name: 'evil-pkg', ecosystem: 'npm' },
        ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.2.3' }] }],
      }],
    }])
    const result = await scanSecurity('evil-pkg', null, false, 'MIT', false, false, [])
    const cve = result.evidence.find(e => e.id === 'cve')!

    expect(cve.points).toBe(15)
    expect(result.cve_count).toBe(0)
  })

  it('does not treat a scored-zero advisory as unrated', async () => {
    const { cve } = await cveEvidence([
      openVuln('GHSA-zero', [
        { type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N' },
      ]),
    ])

    expect(cve.points).toBe(15)
    expect(cve.detail).not.toContain('unrated')
  })
})
