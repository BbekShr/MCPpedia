/**
 * Write a fresh scan's advisories and close the rows it no longer reports.
 *
 * Nothing else ever clears an advisory, so without this the table is
 * append-only: a row stays `open` forever after its package is cleared or
 * renamed (bots/extract-install-info.ts nulls a wrong `npm_package`) or after
 * OSV withdraws the entry, and keeps inflating `open_cves` in every
 * daily_metrics snapshot and on /security.
 *
 * Identity is the `(server_id, cve_id)` pair the unique index backs
 * (migration 20260403010000) — the same key the upsert conflicts on — so an
 * open row whose `cve_id` is absent from the fresh result was not re-confirmed
 * by this scan and is stale. That also covers alias drift: `cve_id` is
 * `aliases.find(CVE-) || id` (lib/scoring.ts), so when OSV later attaches a CVE
 * alias to a GHSA advisory the fresh row lands under a NEW key; closing the
 * old GHSA-keyed row leaves exactly one open row per vulnerability instead of
 * two. Keying identity on the immutable OSV id instead would need a different
 * unique index, i.e. a migration.
 *
 * An EMPTY advisory list is the reconciliation signal, not a no-op: it is
 * exactly what "the package was cleared / OSV withdrew the entry" looks like.
 * Guarding the call on `advisories.length > 0` reintroduces the append-only
 * bug this helper exists to fix.
 *
 * `scanStatus` decides whether closing is safe:
 *  - 'failed'  — do nothing. A 'failed' scan is not evidence about ANY
 *    ecosystem: with two packages one OSV query can succeed while the other
 *    fails and `anyFailed` still reports 'failed' (lib/scoring.ts:853) while
 *    `collectAdvisories` processes the surviving result (:315-316), so the
 *    array is NOT necessarily empty here. And because the upsert writes
 *    `adv.status` — which `collectAdvisories` sets to 'fixed' whenever OSV
 *    reports a fixed version (:309) — upserting on this path can itself close
 *    a row. "Upsert only, never close" is therefore unachievable; the guard
 *    must run before the upsert loop.
 *  - 'pending' — no npm/pip package left to scan. Whether that is trustworthy
 *    depends on WHO cleared the package, which is what `closeOn` encodes.
 *  - 'success' — reconcile.
 *
 * `closeOn` is required, per call site, because 'pending' is attacker-reachable
 * state rather than an OSV verdict: `security_advisories` has no write policy
 * for any authenticated principal, but a maintainer has blanket RLS UPDATE on
 * `servers` (20260417210403_tighten_admin_rls.sql:19-26) and the edit page
 * writes `npm_package` straight from the browser (app/s/[slug]/edit/page.tsx:157).
 * Null both package columns and `scanSecurity` issues ZERO OSV queries and
 * returns `advisories: []` + 'pending' (lib/scoring.ts:849-854) — so an
 * unconditional close on 'pending' would let any maintainer erase any server's
 * public CVE record through refresh-score, whose gate is role-only.
 *  - 'success-or-pending' — for the unattended bot: nobody chose the moment or
 *    the target, and a package-less row genuinely cannot carry a CVE.
 *  - 'success' — for the two user-triggered routes: OSV actually answered.
 *    Still covers the case this helper exists for (OSV withdrew the entry →
 *    'success' with an empty array → close).
 *
 * Returns false if any write failed or threw, so the unattended bot can surface
 * it; the routes ignore it. Fail-soft: it never throws, because two of its
 * three call sites are not wrapped in a try/catch and a scoring run must not
 * die on an advisory write.
 *
 * Shared by all three score writers: bots/compute-scores.ts,
 * /api/server/[slug]/refresh-score and /api/submit.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Advisory, SecurityScanResult } from './scoring'

/** The two columns the stale-set computation reads off an open advisory row. */
export interface OpenAdvisoryRow {
  id: string
  cve_id: string | null
}

export type AdvisoryScanStatus = SecurityScanResult['scan_status']

/**
 * Which open rows this scan no longer confirms. Pure — no IO, no client.
 */
export function selectStaleAdvisoryIds(
  openRows: OpenAdvisoryRow[] | null | undefined,
  freshAdvisories: readonly Pick<Advisory, 'cve_id'>[]
): string[] {
  const fresh = new Set(freshAdvisories.map(a => a.cve_id).filter((id): id is string => !!id))
  // Rows with a null cve_id can't be produced by a scan (the upsert always
  // supplies one), so they're left alone rather than closed on a key we never
  // wrote.
  return (openRows || []).filter(r => r.cve_id && !fresh.has(r.cve_id)).map(r => r.id)
}

/** Which scan statuses this call site trusts enough to close rows on. */
export type AdvisoryCloseOn = 'success' | 'success-or-pending'

/**
 * Upsert the fresh advisories, then close the stale open rows. See the module
 * header for the `scanStatus`/`closeOn` rules. Returns false if any write
 * failed or threw.
 */
export async function reconcileAdvisories(
  client: SupabaseClient,
  serverId: string,
  advisories: Advisory[],
  scanStatus: AdvisoryScanStatus,
  closeOn: AdvisoryCloseOn
): Promise<boolean> {
  let ok = true
  try {
    // FIRST, before the upsert: a failed scan is evidence about nothing, and
    // the upsert itself writes `adv.status` and so can close a row. See header.
    if (scanStatus === 'failed') return ok

    for (const adv of advisories) {
      const { error: upsertError } = await client
        .from('security_advisories')
        .upsert(
          {
            server_id: serverId,
            cve_id: adv.cve_id,
            severity: adv.severity,
            cvss_score: adv.cvss_score,
            title: adv.title,
            description: adv.description,
            affected_versions: adv.affected_versions,
            fixed_version: adv.fixed_version,
            source_url: adv.source_url,
            status: adv.status,
            published_at: adv.published_at,
          },
          { onConflict: 'server_id,cve_id', ignoreDuplicates: false }
        )

      // The only fail-UNSAFE branch in this helper: supabase-js RETURNS errors
      // rather than throwing, so an unlogged failure here silently drops the
      // advisory while the caller reports success.
      if (upsertError) {
        ok = false
        console.error(`  Error upserting advisory ${adv.cve_id}: ${upsertError.message}`)
      }
    }

    // Closing happens only on a status this call site trusts — see the header.
    if (closeOn === 'success' && scanStatus !== 'success') return ok

    // Read AFTER the upsert so anything this scan just refreshed (including
    // advisories it downgraded to 'fixed') is already out of the open set.
    const { data: openRows, error: readError } = await client
      .from('security_advisories')
      .select('id, cve_id')
      .eq('server_id', serverId)
      .eq('status', 'open')

    if (readError) {
      console.error(`  Error reading advisories: ${readError.message}`)
      return false
    }

    const stale = selectStaleAdvisoryIds(openRows, advisories)
    if (stale.length === 0) return ok

    const { error: closeError } = await client
      .from('security_advisories')
      .update({ status: 'fixed' })
      .in('id', stale)

    if (closeError) {
      ok = false
      console.error(`  Error closing stale advisories: ${closeError.message}`)
    } else {
      console.log(`  Closed ${stale.length} stale advisor${stale.length === 1 ? 'y' : 'ies'}`)
    }
  } catch (e) {
    ok = false
    console.error(`  Error reconciling advisories: ${(e as Error).message}`)
  }
  return ok
}
