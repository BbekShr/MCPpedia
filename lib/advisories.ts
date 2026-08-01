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
 *  - 'failed'  — the OSV query itself failed, so zero advisories means
 *    "unreachable", not "gone". Reconciling would mark every real CVE in the
 *    fleet 'fixed' in a single run. Upsert only, never close.
 *  - 'pending' — no npm/pip package left to scan. Trustworthy: with no package
 *    there is no CVE to carry, so the open rows are what's left inconsistent.
 *  - 'success' — reconcile.
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

/**
 * Upsert the fresh advisories, then close the stale open rows. Fail-soft: it
 * never throws, because two of its three call sites are not wrapped in a
 * try/catch and a scoring run must not die on an advisory write.
 */
export async function reconcileAdvisories(
  client: SupabaseClient,
  serverId: string,
  advisories: Advisory[],
  scanStatus: AdvisoryScanStatus
): Promise<void> {
  try {
    for (const adv of advisories) {
      await client
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
    }

    // Closing happens only on a trustworthy scan — see the scanStatus rules in
    // the module header. (`scanSecurity` returns no advisories on failure, so
    // the loop above is empty on this path anyway.)
    if (scanStatus === 'failed') return

    // Read AFTER the upsert so anything this scan just refreshed (including
    // advisories it downgraded to 'fixed') is already out of the open set.
    const { data: openRows, error: readError } = await client
      .from('security_advisories')
      .select('id, cve_id')
      .eq('server_id', serverId)
      .eq('status', 'open')

    if (readError) {
      console.error(`  Error reading advisories: ${readError.message}`)
      return
    }

    const stale = selectStaleAdvisoryIds(openRows, advisories)
    if (stale.length === 0) return

    const { error: closeError } = await client
      .from('security_advisories')
      .update({ status: 'fixed' })
      .in('id', stale)

    if (closeError) {
      console.error(`  Error closing stale advisories: ${closeError.message}`)
    } else {
      console.log(`  Closed ${stale.length} stale advisor${stale.length === 1 ? 'y' : 'ies'}`)
    }
  } catch (e) {
    console.error(`  Error reconciling advisories: ${(e as Error).message}`)
  }
}
