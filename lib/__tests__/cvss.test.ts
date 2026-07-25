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

// CVSS 4.0 vectors carry no C/I/A metrics, so the 3.x formula cannot score them; they
// are banded instead (cvss4VectorSeverity), which decides only records with no publisher
// label. The band is a coarse approximation, so each case below is pinned to a NAMED real
// advisory and the severity its publisher assigned — both read from api.osv.dev — rather
// than to whatever the function happens to compute.
describe('cvss4VectorSeverity — pinned to real v4-only advisories', () => {
  const cases: Array<[string, string, string]> = [
    // parse-server RCE — GHSA says CRITICAL
    ['GHSA-gqpp-xgvh-9h7h', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N', 'critical'],
    // @modelcontextprotocol/sdk ReDoS — a single High (VA), official 8.7, GHSA says HIGH.
    // This is the record that used to read as 'critical' because one High and three Highs
    // landed in the same bucket.
    ['GHSA-8r9q-7v3j-jr4g', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N', 'high'],
    // parse-server DoS, same single-High shape — GHSA says HIGH
    ['GHSA-cgxm-vr2f-6fj8', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N', 'high'],
    // parse-server info leak — GHSA says MODERATE
    ['GHSA-9cp7-3q5w-j92g', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N', 'medium'],
    // parse-server, high privileges and high complexity — GHSA says LOW
    ['GHSA-jpq4-7fmq-q5fj', 'CVSS:4.0/AV:N/AC:H/AT:N/PR:H/UI:N/VC:N/VI:L/VA:N/SC:N/SI:N/SA:N', 'low'],
  ]

  it.each(cases)('%s → %s', (_id, vector, expected) => {
    expect(cvss4VectorSeverity(vector)).toBe(expected)
  })

  it('counts subsequent-system impact, but never as critical on its own', () => {
    // Nothing on the vulnerable system is High, so this must not reach 'critical' —
    // that band feeds cves_critical_open and the generate-blog security-alert query.
    expect(
      cvss4VectorSeverity('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:H/SI:H/SA:H'),
    ).toBe('high')
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

// Precedence: computed CVSS 3.1 score → publisher label → CVSS 4.0 band → unrated.
describe('rateOSVSeverity', () => {
  it('keeps the computed score for a rated advisory', () => {
    expect(rateOSVSeverity([{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }]))
      .toEqual({ cvss_score: 9.8, severity: 'critical' })
  })

  it('rates a v4-only advisory by band when no publisher label exists', () => {
    // PYSEC records ship a v4 vector with no database_specific.severity.
    expect(
      rateOSVSeverity([
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N' },
      ]),
    ).toEqual({ cvss_score: null, severity: 'critical' })
  })

  // Real advisories whose publisher rating contradicts the band. Rating them by band
  // would feed generate-blog's `.in('severity', ['critical','high'])` security-alert
  // query a severity the upstream advisory denies.
  it.each([
    // npm tar, GHSA says MODERATE; band says high (local AV)
    ['GHSA-vmf3-w455-68vh', 'CVSS:4.0/AV:L/AC:L/AT:N/PR:N/UI:N/VC:N/VI:H/VA:N/SC:N/SI:N/SA:N', 'MODERATE'],
    // jupyter-server, GHSA says MODERATE; band says high (subsequent-system High)
    ['GHSA-qh7q-6qm3-653w', 'CVSS:4.0/AV:L/AC:L/AT:N/PR:N/UI:P/VC:N/VI:N/VA:N/SC:H/SI:N/SA:N', 'MODERATE'],
  ])('%s is rated by its publisher label, not by our band', (_id, vector, label) => {
    expect(rateOSVSeverity([{ type: 'CVSS_V4', score: vector }], label))
      .toEqual({ cvss_score: null, severity: 'medium' })
  })

  it('maps every publisher label GHSA uses', () => {
    const v4 = [{ type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N' }]
    expect(rateOSVSeverity(v4, 'CRITICAL').severity).toBe('critical')
    expect(rateOSVSeverity(v4, 'HIGH').severity).toBe('high')
    expect(rateOSVSeverity(v4, 'MODERATE').severity).toBe('medium')
    expect(rateOSVSeverity(v4, 'LOW').severity).toBe('low')
    // Unknown label → falls through to the band, not to unrated
    expect(rateOSVSeverity(v4, 'WHATEVER').severity).toBe('medium')
  })

  it('uses the publisher label when a record carries no CVSS vector at all', () => {
    // e.g. GHSA-3mpp-xfvh-qh37 (node-ipc): severity array empty, label LOW.
    expect(rateOSVSeverity([], 'LOW')).toEqual({ cvss_score: null, severity: 'low' })
  })

  it('marks an advisory with no severity data and no label as unrated (null score + info)', () => {
    // e.g. MAL-2026-3744: no severity array, no database_specific.severity.
    expect(rateOSVSeverity(undefined)).toEqual({ cvss_score: null, severity: 'info' })
    expect(rateOSVSeverity([{ type: 'CVSS_V2', score: 'AV:N/AC:L/Au:N/C:P/I:P/A:P' }]))
      .toEqual({ cvss_score: null, severity: 'info' })
  })

  it('treats a zero rating as rated, not unrated — score 0, never null', () => {
    // A banded-zero v4 vector is a real 0.0 rating.
    expect(
      rateOSVSeverity([
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N' },
      ]),
    ).toEqual({ cvss_score: 0, severity: 'info' })
    // As is a computed 0.0 v3 vector, and a plain numeric "0" from OSV.
    expect(rateOSVSeverity([{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N' }]))
      .toEqual({ cvss_score: 0, severity: 'info' })
    expect(rateOSVSeverity([{ type: 'CVSS_V3', score: '0' }]))
      .toEqual({ cvss_score: 0, severity: 'info' })
  })

  it('does not let a zero-impact v3 vector mask a rated v4 vector or label', () => {
    const zeroV3 = { type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N' }
    const criticalV4 = {
      type: 'CVSS_V4',
      score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N',
    }
    expect(rateOSVSeverity([zeroV3, criticalV4]).severity).toBe('critical')
    expect(rateOSVSeverity([zeroV3], 'HIGH').severity).toBe('high')
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

  // An open advisory has no "fixed" event in its affected ranges. `label` mirrors the
  // real OSV shape: database_specific.severity, which GHSA records carry and MAL-* omit.
  function openVuln(id: string, severity?: Array<{ type: string; score: string }>, label?: string) {
    return {
      id,
      summary: `${id} summary`,
      severity,
      database_specific: label ? { severity: label } : undefined,
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

  it('does not treat a banded-zero CVSS 4.0 advisory as unrated either', async () => {
    const { result, cve } = await cveEvidence([
      openVuln('GHSA-v4-zero', [
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N' },
      ]),
    ])

    expect(result.advisories[0].severity).toBe('info')
    expect(cve.points).toBe(15)
    expect(cve.detail).not.toContain('unrated')
  })

  // Ground truth from api.osv.dev: these two records' publisher ratings contradict the
  // CVSS 4.0 band, and the stored severity is what /security renders, what home_stats
  // counts as cves_critical_open, and what generate-blog turns into a SECURITY ALERT post.
  it('stores the publisher severity, not the band, for real v4-only advisories', async () => {
    const { result, cve } = await cveEvidence([
      // @modelcontextprotocol/sdk ReDoS — official 8.7, GHSA HIGH (banded critical before)
      openVuln('GHSA-8r9q-7v3j-jr4g', [
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N' },
      ], 'HIGH'),
      // npm tar — GHSA MODERATE (banded high before)
      openVuln('GHSA-vmf3-w455-68vh', [
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:L/AC:L/AT:N/PR:N/UI:N/VC:N/VI:H/VA:N/SC:N/SI:N/SA:N' },
      ], 'MODERATE'),
      // jupyter-server — GHSA MODERATE (banded high before)
      openVuln('GHSA-qh7q-6qm3-653w', [
        { type: 'CVSS_V4', score: 'CVSS:4.0/AV:L/AC:L/AT:N/PR:N/UI:P/VC:N/VI:N/VA:N/SC:H/SI:N/SA:N' },
      ], 'MODERATE'),
    ])

    expect(result.advisories.map(a => a.severity)).toEqual(['high', 'medium', 'medium'])
    expect(result.advisories.filter(a => a.severity === 'critical')).toHaveLength(0)
    // 5 + 3 + 3
    expect(cve.points).toBe(4)
    expect(cve.detail).toBe('3 open CVE(s): 1 critical/high, 2 medium, 0 low')
  })
})
