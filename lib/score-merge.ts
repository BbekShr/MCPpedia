/**
 * Merge rules for the security component when an OSV scan fails.
 *
 * When OSV/deps.dev is down or rate-limiting, `scanSecurity` still returns a
 * score — but one computed as if the package had no known CVEs. Writing that
 * over a good prior scan inflates the score; writing CVE-derived columns over
 * good data destroys it. This helper decides what the three score writers
 * (bots/compute-scores.ts, /api/server/[slug]/refresh-score, /api/submit)
 * should persist. It is pure so the rules can be unit-tested directly.
 */

import type { SecurityScanResult } from './scoring'

/** The stored row being updated — only the columns the merge depends on. */
export interface PreviousSecurityState {
  score_security?: number | null
  last_security_scan?: string | null
}

export interface FreshScoreInput {
  scan_status: SecurityScanResult['scan_status']
  /** Fresh 0-30 security component from this run's `scanSecurity`. */
  security_score: number
  /** Sum of the four non-security components (efficiency + docs + compat + maintenance). */
  other_score_total: number
}

export interface MergedScores {
  score_total: number
  score_security: number
  /** True when CVE-derived columns (`cve_count`, `security_evidence`) must NOT be written. */
  osv_failed: boolean
}

export function mergeScoresOnOsvFailure(
  previous: PreviousSecurityState | null | undefined,
  fresh: FreshScoreInput
): MergedScores {
  const osvFailed = fresh.scan_status === 'failed'

  // `score_security` is `integer default 0` (not nullable), so a null check
  // can't tell "never scanned" from "scanned, scored 0" — a fresh import whose
  // first OSV query 429s would otherwise be pinned at 0/30. `last_security_scan`
  // is the honest "was this row ever scanned" signal: null on a fresh import,
  // set once any scan has run.
  //
  // Deliberately NOT also requiring `security_scan_status === 'success'`: every
  // writer stamps `security_scan_status` and `last_security_scan` on EVERY run,
  // failures included, so run N of an outage would flip the status to 'failed'
  // and run N+1 would stop trusting the value run N just preserved — the score
  // would jump to the CVE-blind "no vulns found" number on the second
  // consecutive failure. The preserved component must survive an outage of any
  // length. Do not "tighten" this predicate with the status column.
  const priorScore = previous?.score_security
  const hasTrustedPrior =
    osvFailed &&
    previous?.last_security_scan != null &&
    typeof priorScore === 'number'

  const scoreSecurity = hasTrustedPrior ? priorScore : fresh.security_score

  // Clamp AFTER the swap: a preserved prior component larger than the fresh one
  // can push the sum past 100, and the 0-100 range is a published contract.
  return {
    osv_failed: osvFailed,
    score_security: scoreSecurity,
    score_total: Math.max(0, Math.min(100, fresh.other_score_total + scoreSecurity)),
  }
}
