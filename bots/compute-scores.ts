/**
 * Score Computation Bot — computes real MCPpedia scores for all servers.
 * Uses OSV.dev for CVE data, actual token measurement, README analysis.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'
import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getReadme } from './lib/github'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
  SCORE_WEIGHTS,
} from '../lib/scoring'
import type { Advisory } from '../lib/scoring'
import { deriveDangerousPatternCount, deriveInjectionRisk } from '../lib/security-columns'
import { mergeScoresOnOsvFailure } from '../lib/score-merge'
import type { Tool } from '../lib/types'

const supabase = createAdminClient('bot-compute-scores')

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

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
 * MUST NOT be called when the OSV scan failed — see the call site.
 */
async function reconcileAdvisories(serverId: string, advisories: Advisory[]) {
  for (const adv of advisories) {
    await supabase
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

  // Read AFTER the upsert so anything this scan just refreshed (including
  // advisories it downgraded to 'fixed') is already out of the open set.
  const { data: openRows, error: readError } = await supabase
    .from('security_advisories')
    .select('id, cve_id')
    .eq('server_id', serverId)
    .eq('status', 'open')

  if (readError) {
    console.error(`  Error reading advisories: ${readError.message}`)
    return
  }

  const fresh = new Set(advisories.map(a => a.cve_id).filter((id): id is string => !!id))
  // Rows with a null cve_id can't be produced by a scan (the upsert always
  // supplies one), so they're left alone rather than closed on a key we never
  // wrote.
  const stale = (openRows || []).filter(r => r.cve_id && !fresh.has(r.cve_id)).map(r => r.id)
  if (stale.length === 0) return

  const { error: closeError } = await supabase
    .from('security_advisories')
    .update({ status: 'fixed' })
    .in('id', stale)

  if (closeError) {
    console.error(`  Error closing stale advisories: ${closeError.message}`)
  } else {
    console.log(`  Closed ${stale.length} stale advisor${stale.length === 1 ? 'y' : 'ies'}`)
  }
}

async function main() {
  const run = await BotRun.start('compute-scores')
  try {
  console.log('=== MCPpedia Score Computation ===')
  console.log(new Date().toISOString())

  // Supabase returns max 1000 rows by default — paginate to get all.
  // Stalest-first ordering pairs with the wall-clock deadline below: if a run
  // can't finish every server before the GitHub Actions 6h job limit, it exits
  // cleanly and the next run picks up the servers it didn't reach.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servers: any[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('servers')
      .select('*')
      .order('score_computed_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true }) // stable tiebreak for pagination
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (batchError) {
      await run.fail(`Failed to fetch servers: ${batchError.message}`)
      throw new Error(batchError.message)
    }
    if (!batch || batch.length === 0) break
    servers.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }

  if (servers.length === 0) {
    await run.fail('No servers found')
    throw new Error('No servers found')
  }

  console.log(`Computing scores for ${servers.length} servers...\n`)

  // Wall-clock budget: GitHub Actions kills jobs at 6h, which was cancelling
  // most runs mid-flight (no BotRun.finish, no cache revalidation). Stop
  // scoring cleanly at 5h and let the next run continue — the stalest-first
  // ordering above guarantees the unreached servers go first tomorrow.
  const DEADLINE_MS = 5 * 60 * 60 * 1000
  const startedAt = Date.now()

  let processed = 0
  // Slugs whose total score shifted ≥ 2 points this run. Used after the loop
  // to revalidate /compare/... pages containing them (score-driven freshness
  // for compare pages; individual /s/{slug} pages accept up to 7-day lag).
  const movedSlugs = new Set<string>()

  for (const server of servers) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      console.warn(`\nDeadline (5h) reached after ${processed}/${servers.length} servers — exiting cleanly. Next run resumes with the stalest.`)
      break
    }
    console.log(`[${processed + 1}/${servers.length}] ${server.slug}`)

    // 2. EFFICIENCY — measure actual tool schema tokens (compute tools early, security needs it)
    const tools = (server.tools || []) as Tool[]

    // 1. SECURITY + 3. DOCUMENTATION README — the OSV/deps.dev scan and the
    // GitHub README fetch are independent network calls; overlapping them
    // roughly halves per-server wall time across ~19k servers.
    const parsed = server.github_url ? parseGitHubUrl(server.github_url) : null
    const [security, readme] = await Promise.all([
      scanSecurity(
        server.npm_package,
        server.pip_package,
        server.has_authentication || false,
        server.license,
        server.is_archived || false,
        server.security_verified || false,
        tools,
        server.tool_definition_hash || null
      ),
      parsed ? getReadme(parsed.owner, parsed.repo) : Promise.resolve(null),
    ])
    console.log(`  Security: ${security.score}/${SCORE_WEIGHTS.security} (${security.cve_count} CVEs, ${security.evidence.length} checks)`)
    const efficiency = measureTokenEfficiency(tools)
    console.log(`  Efficiency: ${efficiency.score}/${SCORE_WEIGHTS.efficiency} (${efficiency.total_tool_tokens} tokens, grade ${efficiency.grade})`)

    const docs = await scoreDocumentation(
      readme,
      server.description,
      server.tagline,
      tools,
      server.install_configs || {},
      server.api_name,
      server.github_url,
      server.homepage_url
    )
    console.log(`  Documentation: ${docs.score}/${SCORE_WEIGHTS.documentation} (README: ${docs.readme_quality})`)

    // 4. COMPATIBILITY — transport + client checks
    const compat = scoreCompatibility(
      server.transport || [],
      server.compatible_clients || [],
      tools
    )
    console.log(`  Compatibility: ${compat.score}/${SCORE_WEIGHTS.compatibility}`)

    // 5. MAINTENANCE — GitHub + npm metrics
    const maint = scoreMaintenance(
      server.github_last_commit,
      server.github_stars || 0,
      server.npm_weekly_downloads || 0,
      server.github_open_issues || 0,
      server.is_archived || false,
      server.verified || false
    )
    console.log(`  Maintenance: ${maint.score}/${SCORE_WEIGHTS.maintenance}`)

    // OSV scan failed — preserve the last good security component (if any) and
    // skip CVE-derived columns, to avoid overwriting good data with an inflated
    // "no CVEs found" result from a transient API outage.
    const merged = mergeScoresOnOsvFailure(server, {
      scan_status: security.scan_status,
      security_score: security.score,
      other_score_total: efficiency.score + docs.score + compat.score + maint.score,
    })
    const osvFailed = merged.osv_failed
    console.log(`  TOTAL: ${merged.score_total}/100\n`)

    const oldTotal = server.score_total ?? 0
    if (Math.abs(merged.score_total - oldTotal) >= 2) {
      movedSlugs.add(server.slug)
    }

    // Update server record
    const { error: updateError } = await supabase
      .from('servers')
      .update({
        score_total: merged.score_total,
        score_security: merged.score_security,
        score_maintenance: maint.score,
        score_documentation: docs.score,
        score_compatibility: compat.score,
        score_efficiency: efficiency.score,
        score_computed_at: new Date().toISOString(),
        // Security fields — always write non-CVE ones; skip CVE-derived when scan
        // failed. Every column derived from `security.evidence` moves together
        // with the evidence array itself — writing fresh flags beside a stale
        // evidence list makes the row self-contradictory where ScorePanel
        // renders both.
        has_authentication: security.has_authentication,
        ...(osvFailed ? {} : {
          cve_count: security.cve_count,
          security_evidence: security.evidence,
          has_code_execution: security.evidence.some(e => e.id === 'tool-safety' && e.pass === false),
          has_injection_risk: deriveInjectionRisk(security.evidence),
          dangerous_pattern_count: deriveDangerousPatternCount(security.evidence),
        }),
        security_scan_status: security.scan_status,
        last_security_scan: new Date().toISOString(),
        // Deliberately NOT under the guard above: dep-health comes from deps.dev,
        // and scan_status 'failed' reflects only the OSV queries — so this entry
        // is genuinely fresh during an OSV outage.
        dep_health_score: security.evidence.find(e => e.id === 'dep-health')?.points ?? null,
        dependency_count: null, // deps.dev doesn't reliably return this yet
        has_tool_poisoning: security.has_tool_poisoning,
        tool_poisoning_flags: security.tool_poisoning_flags,
        tool_definition_hash: security.tool_definition_hash,
        // Efficiency fields
        total_tool_tokens: efficiency.total_tool_tokens,
        estimated_tokens_per_call: efficiency.estimated_tokens_per_call,
        token_efficiency_grade: efficiency.grade,
        // Documentation evidence
        doc_readme_quality: docs.readme_quality,
        doc_has_setup: docs.has_setup_instructions,
        doc_has_examples: docs.has_examples,
        doc_tool_schema_ratio: tools.length > 0
          ? tools.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0).length / tools.length
          : null,
      })
      .eq('id', server.id)

    if (updateError) {
      console.error(`  Error updating ${server.slug}: ${updateError.message}`)
    }

    // Upsert security advisories, and close the ones this scan no longer
    // reports — but ONLY when the scan result is trustworthy.
    //
    // A 'failed' scan returns zero advisories because OSV was unreachable, not
    // because the CVEs are gone; reconciling on that would mark every real CVE
    // in the fleet "fixed" in a single run. Never reconcile on the osvFailed
    // path — same guard the CVE-derived columns above use.
    //
    // 'pending' (no npm/pip package left to scan) IS trustworthy: there is no
    // package to carry a CVE, and the update above already wrote cve_count = 0
    // for it, so the advisory rows are what's left inconsistent.
    if (!osvFailed) {
      await reconcileAdvisories(server.id, security.advisories)
    }

    processed++
    run.addProcessed()
    run.addUpdated()

    // Rate limit — be nice to OSV.dev
    await new Promise(r => setTimeout(r, 300))
  }

  run.setSummary({ scored: processed })
  console.log(`\nDone. Scored ${processed} servers.`)
  await run.finish()

  await refreshHomeStatsCache()
  await revalidateSiteCache()
  await revalidateComparePages(movedSlugs)
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

// Recompute the home_stats_cache row so /security and the homepage hero
// reflect today's totals. Runs as service_role (statement_timeout raised to
// 120s in migration 20260718120000 — the full-table scan outgrew the previous
// ceiling once the catalog passed ~20k servers) so it can scan the servers
// table + advisories; the anon-facing home_stats() RPC then becomes a sub-ms
// single-row read.
//
// The previous cache row stays intact on failure, so this does not corrupt
// data — but a silent failure means the homepage/security stats go stale
// unnoticed (this is exactly how the cache sat frozen for ~2 weeks). So on
// failure we log at error level and mark the run failed (non-zero exit) to
// surface it, without throwing — later steps (cache revalidation) still run.
async function refreshHomeStatsCache() {
  try {
    const { error } = await supabase.rpc('refresh_home_stats_cache')
    if (error) {
      console.error(`refresh_home_stats_cache failed — home_stats_cache is now stale: ${error.message}`)
      process.exitCode = 1
      return
    }
    console.log('Refreshed home_stats_cache.')
  } catch (err) {
    console.error(`refresh_home_stats_cache threw — home_stats_cache is now stale: ${String(err)}`)
    process.exitCode = 1
  }
}

// Poke the Next.js ISR cache so /security and / reflect today's scan on the
// next request instead of waiting for their revalidate windows (1h and 24h)
// to expire on organic traffic. Failure here is non-fatal — the bot's data
// write already succeeded and the cache will self-heal eventually.
async function revalidateSiteCache() {
  const siteUrl = process.env.SITE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!siteUrl || !secret) {
    console.log('Skipping cache revalidation — SITE_URL or REVALIDATE_SECRET not set.')
    return
  }
  try {
    const res = await fetch(`${siteUrl.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ paths: ['/', '/security'] }),
    })
    if (!res.ok) {
      console.warn(`Cache revalidation returned ${res.status}: ${await res.text()}`)
      return
    }
    console.log(`Cache revalidation: ${await res.text()}`)
  } catch (err) {
    console.warn(`Cache revalidation failed: ${String(err)}`)
  }
}

// For each slug whose score shifted materially, find every /compare/a-vs-b
// page containing it and refresh those pages on-demand. Compare pages are
// set to a 7-day TTL to cut ISR writes; this call keeps them accurate when
// scores actually move. Batched to respect /api/revalidate's 200-path cap.
async function revalidateComparePages(movedSlugs: Set<string>) {
  if (movedSlugs.size === 0) {
    console.log('No score deltas ≥ 2 — skipping compare-page revalidation.')
    return
  }
  const siteUrl = process.env.SITE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!siteUrl || !secret) {
    console.log('Skipping compare-page revalidation — SITE_URL or REVALIDATE_SECRET not set.')
    return
  }

  interface Pair { slugA: string; slugB: string }
  let pairs: Pair[] = []
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'comparison-pairs.json'), 'utf-8')
    pairs = JSON.parse(raw).pairs ?? []
  } catch (err) {
    console.warn(`Could not read comparison-pairs.json: ${String(err)}`)
    return
  }

  const paths = new Set<string>()
  for (const p of pairs) {
    if (movedSlugs.has(p.slugA) || movedSlugs.has(p.slugB)) {
      paths.add(`/compare/${p.slugA}-vs-${p.slugB}`)
    }
  }
  if (paths.size === 0) {
    console.log(`${movedSlugs.size} slugs moved, but none appear in comparison-pairs.json.`)
    return
  }

  const all = Array.from(paths)
  const endpoint = `${siteUrl.replace(/\/$/, '')}/api/revalidate`
  console.log(`Revalidating ${all.length} compare page(s) for ${movedSlugs.size} moved slug(s)...`)
  for (let i = 0; i < all.length; i += 200) {
    const batch = all.slice(i, i + 200)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ paths: batch }),
      })
      if (!res.ok) {
        console.warn(`Compare revalidation batch returned ${res.status}: ${await res.text()}`)
      }
    } catch (err) {
      console.warn(`Compare revalidation batch failed: ${String(err)}`)
    }
  }
}

main().catch(console.error)
