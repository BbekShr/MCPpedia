/**
 * Derivations of the `servers` security columns from a scan's evidence array.
 *
 * Three writers persist these columns — bots/compute-scores.ts,
 * /api/server/[slug]/refresh-score and /api/submit. When each derived them
 * inline the definitions drifted (S46: the bot ignored `tool-poisoning`, so a
 * nightly run silently cleared a flag the API routes had set). Every writer must
 * go through these helpers so the stored value cannot depend on which one ran
 * last. Pure, so the rules can be unit-tested directly.
 */

import type { SecurityEvidence } from './scoring'

/**
 * `has_injection_risk` — true when the scan positively found an injection
 * vector.
 *
 * Includes `tool-poisoning` as well as `injection`: a hidden-instruction payload
 * in a tool description IS an injection risk, and for a flag that drives UI
 * badges and the public MCP surface, under-reporting is the worse error. Only
 * `pass === false` counts — `pass === null` means the check could not run (no
 * tools to analyze), which is not evidence of safety OR of risk, and the column
 * is a non-nullable boolean, so "unknown" has to fall on the false side here.
 */
export function deriveInjectionRisk(evidence: SecurityEvidence[]): boolean {
  return evidence.some(
    e => (e.id === 'injection' || e.id === 'tool-poisoning') && e.pass === false
  )
}

/**
 * `dangerous_pattern_count` — how many dangerous patterns the `tool-safety`
 * check found, expressed as the points it deducted.
 *
 * `null` when the check could not run (`pass === null`, i.e. no tools were
 * extracted). It scores 0/3 in that case, so the old `max_points - points`
 * arithmetic reported 3 dangerous patterns for a server with nothing to analyze
 * (S43); 0 would be just as wrong in the other direction, claiming it was
 * scanned and found clean.
 */
export function deriveDangerousPatternCount(
  evidence: SecurityEvidence[]
): number | null {
  const e = evidence.find(x => x.id === 'tool-safety')
  if (!e || e.pass === null) return null
  return e.max_points - e.points
}
