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
import { deriveDangerousPatternCount, deriveInjectionRisk } from '../lib/security-columns'
import { mergeScoresOnOsvFailure } from '../lib/score-merge'
import { reconcileAdvisories } from '../lib/advisories'
import type { Tool } from '../lib/types'

const supabase = createAdminClient('bot-compute-scores')

// Every column the scoring loop reads, plus the two mergeScoresOnOsvFailure
// needs off the previous row (`score_security`, `last_security_scan`). This was
// `select('*')`, which shipped `resources`, `prompts` and every other unread
// column for the whole catalog on every daily run — the largest single source
// of Supabase egress on the account.
//
// This list is load-bearing: a field missing here reads as `undefined` in the
// loop and silently scores the server wrong rather than failing. Adding a
// `server.<field>` reference below means adding the column here.
const SCORING_FIELDS = [
  'id', 'slug',
  'tools', 'install_configs', 'transport', 'compatible_clients',
  'description', 'tagline', 'api_name', 'homepage_url', 'github_url',
  'npm_package', 'pip_package', 'license',
  'github_last_commit', 'github_stars', 'github_open_issues', 'npm_weekly_downloads',
  'is_archived', 'verified', 'security_verified', 'has_authentication',
  'tool_definition_hash',
  'score_total', 'score_security', 'last_security_scan',
].join(', ')

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function main() {
  const run = await BotRun.start('compute-scores')
  try {
  console.log('=== MCPpedia Score Computation ===')
  console.log(new Date().toISOString())

  // Only servers whose score has gone stale are walked and hydrated. The daily
  // run used to take the whole catalog (65,744 rows as of July 2026) as its
  // working set and let the 5h deadline decide how much of it got scored; at
  // ~10-20 KB of hydrated JSONB per server that was the single largest line
  // item on a 5 GB/month egress plan, and most of it re-derived a score that
  // had not changed. Measured against prod when this landed, the filter cut the
  // working set to ~1,000 servers.
  //
  // Two tiers, because "stale" is not the same for a live server as for an
  // archived one: live servers rotate on SCORE_STALE_DAYS (7 by default),
  // archived ones on 30. Archived servers are deliberately still scored — the
  // formula penalises `is_archived` and their pages still render — they just
  // don't need weekly attention.
  //
  // The `created_at` arm is the important one. A newly discovered server is
  // scored the same day (score_computed_at IS NULL sorts first) but BEFORE
  // extract-install-info and enrich-descriptions have filled in its
  // `npm_package`, `install_configs` and `description`, so that first score is
  // computed on a half-empty row: no package to scan means 'pending' security
  // and a `cve_count` of 0. Without this arm the corrective rescore would wait
  // a full week, leaving a server that may well have a real CVE advertising
  // "no CVEs found". Three days of daily rescoring covers the enrichment
  // pipeline's Mon/Thu cadence.
  //
  // Cost of the window: a score, its CVE count and its advisory reconciliation
  // can lag reality by up to SCORE_STALE_DAYS. That matches the lag /s/{slug}
  // already accepts (see the comment on movedSlugs below).
  //
  // Note the 7-day echo: every server scored on day D falls due again on D+7
  // together, so daily batch sizes replay whatever distribution exists today
  // rather than smoothing to catalog/7. Stalest-first ordering plus the
  // deadline absorb the peaks — a spike just means some servers wait a day.
  const SCORE_STALE_DAYS = Number(process.env.SCORE_STALE_DAYS) || 7
  const ARCHIVED_STALE_DAYS = 30
  const NEW_SERVER_DAYS = 3
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
  // Safe unquoted inside an `or` tree: toISOString() is always Z-suffixed and
  // contains none of PostgREST's reserved characters (, ( ) ").
  const staleFilter = [
    'score_computed_at.is.null',
    `and(is_archived.not.is.true,score_computed_at.lt.${daysAgo(SCORE_STALE_DAYS)})`,
    `and(is_archived.is.true,score_computed_at.lt.${daysAgo(ARCHIVED_STALE_DAYS)})`,
    `created_at.gt.${daysAgo(NEW_SERVER_DAYS)}`,
  ].join(',')

  // Supabase returns max 1000 rows by default — paginate to get the full order.
  // Stalest-first ordering pairs with the wall-clock deadline below: if a run
  // can't finish every stale server before the GitHub Actions 6h job limit, it
  // exits cleanly and the next run picks up the servers it didn't reach.
  //
  // Ids only, deliberately. This walk used to be `select('*')`, which pulled
  // every column — `tools`, `resources`, `prompts`, `install_configs` — of all
  // ~46k servers on every daily run, and then the deadline below stopped the
  // loop after a few thousand, so most of that download was never read. On a
  // 5 GB/month egress plan that single query was the baseline that eventually
  // got the project restricted. Full rows are now hydrated a chunk at a time
  // inside the loop, where the deadline stops the fetching too.
  //
  // The order is captured up front rather than walked lazily because the loop
  // writes `score_computed_at`: an OFFSET walk over the live ordering would
  // re-sort processed rows to the back underneath itself and skip a page's
  // worth of servers every time it advanced.
  const ids: string[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('servers')
      .select('id')
      .or(staleFilter)
      .order('score_computed_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true }) // stable tiebreak for pagination
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (batchError) {
      await run.fail(`Failed to fetch servers: ${batchError.message}`)
      throw new Error(batchError.message)
    }
    if (!batch || batch.length === 0) break
    ids.push(...batch.map(r => r.id as string))
    if (batch.length < PAGE_SIZE) break
    page++
  }

  // An empty result is now AMBIGUOUS, so it can't be blanket-fatal the way it
  // was before the staleness filter above existed. "Every server was scored
  // recently" is the healthy steady state and has to finish clean: failing here
  // would skip refreshHomeStatsCache() below, and two consecutive skips take
  // freshness-probe (48h threshold) red and open an alert issue for a fleet
  // that is perfectly up to date.
  //
  // An empty *table*, on the other hand, is still a catastrophe worth shouting
  // about. A head-only count distinguishes the two for zero row egress.
  if (ids.length === 0) {
    const { count, error: countError } = await supabase
      .from('servers')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      await run.fail(`Failed to count servers: ${countError.message}`)
      throw new Error(countError.message)
    }
    if (!count) {
      await run.fail('No servers found')
      throw new Error('No servers found')
    }
    console.log(`No stale servers — all ${count} scored within the window. Refreshing caches only.\n`)
  } else {
    console.log(`Computing scores for ${ids.length} stale servers...\n`)
  }

  // Hydrate in chunks so that breaking out of the loop below stops the reads.
  // 100 keeps the per-chunk payload small while staying well inside PostgREST's
  // URL length budget for an `in` filter of uuids.
  const HYDRATE_CHUNK = 100
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function* hydrate(): AsyncGenerator<any> {
    for (let i = 0; i < ids.length; i += HYDRATE_CHUNK) {
      const chunkIds = ids.slice(i, i + HYDRATE_CHUNK)
      const { data: rows, error: chunkError } = await supabase
        .from('servers')
        .select(SCORING_FIELDS)
        .in('id', chunkIds)

      if (chunkError) {
        console.error(`  Error hydrating servers ${i}-${i + chunkIds.length - 1}: ${chunkError.message}`)
        continue
      }
      // `in` does not preserve argument order; re-emit in the stalest-first
      // order the id walk established. A row missing here was deleted between
      // the two reads, which is not an error.
      const byId = new Map((rows ?? []).map(r => [(r as unknown as { id: string }).id, r]))
      for (const id of chunkIds) {
        const row = byId.get(id)
        if (row) yield row
      }
    }
  }

  // Wall-clock budget: GitHub Actions kills jobs at 6h, which was cancelling
  // most runs mid-flight (no BotRun.finish, no cache revalidation). Stop
  // scoring cleanly at 5h and let the next run continue — the stalest-first
  // ordering above guarantees the unreached servers go first tomorrow.
  const DEADLINE_MS = 5 * 60 * 60 * 1000
  const startedAt = Date.now()

  let processed = 0
  // Servers whose advisory reconciliation logged an error. Broader than the
  // name: any reconcile failure counts here — a failed upsert, the open-rows
  // READ (lib/advisories.ts:173-176), the close, or a thrown client. The helper
  // is fail-soft by design, so this counter is the only thing that reaches the
  // run summary.
  let advisoryWriteFailures = 0
  // Servers whose `servers` score UPDATE itself failed — disjoint from
  // `advisoryWriteFailures` above, which counts reconcile failures only. A
  // failed update skips the reconcile entirely (see the guard below), so the
  // two counters never describe the same server.
  let serverUpdateFailures = 0
  // Slugs whose total score shifted ≥ 2 points this run. Used after the loop
  // to revalidate /compare/... pages containing them (score-driven freshness
  // for compare pages; individual /s/{slug} pages accept up to 7-day lag).
  const movedSlugs = new Set<string>()

  for await (const server of hydrate()) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      console.warn(`\nDeadline (5h) reached after ${processed}/${ids.length} servers — exiting cleanly. Next run resumes with the stalest.`)
      break
    }
    console.log(`[${processed + 1}/${ids.length}] ${server.slug}`)

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
    // Unconditional, and deliberately NOT under the update guard below:
    // `movedSlugs` is a cache-invalidation hint, not a write. Over-revalidating
    // costs one entry in an already-batched POST; under-revalidating leaves
    // /compare/... serving a stale score for its full ISR TTL. postgrest-js
    // returns `{error}` rather than throwing, so a transport failure AFTER the
    // UPDATE committed surfaces as a non-null `updateError` while the new score
    // IS live — and because `score_computed_at` landed, the stale filter will
    // not revisit that server for SCORE_STALE_DAYS.
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

    // Everything below is guarded on the scores actually landing, mirroring
    // app/api/server/[slug]/refresh-score/route.ts:211-218. A failed UPDATE
    // (statement timeout 57014, a transient PostgREST 5xx) followed by a
    // zero-advisory scan would close every open advisory row while `cve_count`
    // and `score_security` keep the OLD CVE penalty — a green "no known CVEs"
    // verdict beside a row that still counts CVEs. Skipping the reconcile is
    // the safe branch, but it is not free, and "the next run retries" holds
    // ONLY when the write did not commit: an unstamped `score_computed_at`
    // keeps the row in the stale filter and at the head of the stalest-first
    // walk. A LOST RESPONSE AFTER A COMMIT stamps `score_computed_at`, drops
    // the row out of the stale set, and so defers the skipped reconcile by up
    // to SCORE_STALE_DAYS (7 days).
    // What the safe branch gives up: reconcileAdvisories is the only CREATOR of
    // security_advisories rows as well as the only closer, so skipping it also
    // means a newly published CVE for this server is not recorded tonight. The
    // trade is deliberate — a false-green "no known CVEs" beside a non-zero
    // `cve_count` is worse than a delayed disclosure — and an upsert-only mode
    // is NOT a safe alternative, because the upsert writes `adv.status` and can
    // itself close a row (lib/advisories.ts).
    // The exposure here is WIDER than the route's, because this call passes
    // `closeOn: 'success-or-pending'`: under that policy lib/advisories.ts's
    // early return is DISABLED for every status, so a 'pending' scan closes
    // rows too.
    // Deliberately if/else rather than `continue`: a `continue` would skip the
    // 300 ms OSV politeness sleep below, removing the throttle on exactly the
    // run where every write is failing.
    if (updateError) {
      console.error(`  Error updating ${server.slug}: ${updateError.message}`)
      serverUpdateFailures++
    } else {
      // Upsert this scan's advisories and close the ones it no longer reports.
      // The helper decides what is safe to close from `scan_status` — see the
      // rules in lib/advisories.ts. 'success-or-pending' because this run is
      // unattended: nobody picked the moment or the target, so a package-less
      // ('pending') row genuinely carries no CVE. The helper is fail-soft, so
      // count its failures here — an unattended bot must not report success on a
      // run where advisory writes were silently dropped.
      const reconciled = await reconcileAdvisories(
        supabase, server.id, security.advisories, security.scan_status, 'success-or-pending'
      )
      if (!reconciled) advisoryWriteFailures++
    }

    processed++
    run.addProcessed()
    if (!updateError) run.addUpdated()

    // Rate limit — be nice to OSV.dev
    await new Promise(r => setTimeout(r, 300))
  }

  // Counted and logged, but deliberately NOT `process.exitCode = 1`: an advisory
  // upsert can fail for a reason that is reachable and persistent (a CVSS score
  // wider than the `numeric(3,1)` column overflows with Postgres 22003), so one
  // bad OSV record anywhere in the fleet would pin this nightly run red until an
  // unrelated fix lands — and alert-on-failure.yml watches this workflow, so a
  // permanently-red bot masks genuine failures. The counter plus the per-CVE
  // errors already remove the silence. (Unlike refreshHomeStatsCache below,
  // which is one global operation, not a per-server counter.)
  run.setSummary({
    attempted: processed,
    scored: processed - serverUpdateFailures,
    advisoryWriteFailures,
    serverUpdateFailures,
  })
  console.log(`\nDone. Attempted ${processed}, scored ${processed - serverUpdateFailures}.`)
  await run.finish()

  await refreshHomeStatsCache()
  await refreshHomeAggregatesCache()
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

// Recompute the home_aggregates_cache row backing the homepage's "Browse by use
// case" and "Browse by category" sections. Same shape and same rationale as
// refreshHomeStatsCache above: it runs as service_role under the 120s
// statement_timeout, against aggregates that cost ~3.3s combined and blow the
// anon role's 3s ceiling on the request path (the 2026-08-01 incident).
//
// Failure leaves the previous snapshot intact but silently stale, so log at
// error level and mark the run failed — without throwing, so revalidateSiteCache
// still runs.
async function refreshHomeAggregatesCache() {
  try {
    const { error } = await supabase.rpc('refresh_home_aggregates_cache')
    if (error) {
      // PGRST202 = function not in PostgREST's schema cache, i.e. the migration
      // has not been applied yet. Migrations are applied by hand here (they do
      // not auto-apply on deploy), so between merging this code and a human
      // running the file there is a window where this RPC cannot exist. Failing
      // it would pin this nightly run red for that whole window — and
      // alert-on-failure.yml watches this workflow, so a permanently-red bot
      // masks genuine failures (the rule already stated at :369-377 above). This
      // tolerance covers ONLY that manual-apply gap; every other error still
      // fails the run.
      if (error.code === 'PGRST202') {
        console.warn(
          'refresh_home_aggregates_cache does not exist yet — apply ' +
            'supabase/migrations/20260801120000_home_aggregates_snapshot_cache.sql. ' +
            'Skipping the refresh; the homepage use-case and category sections stay empty until then.',
        )
        return
      }
      console.error(
        `refresh_home_aggregates_cache failed — home_aggregates_cache is now stale: ${error.message}`,
      )
      process.exitCode = 1
      return
    }
    console.log('Refreshed home_aggregates_cache.')
  } catch (err) {
    console.error(
      `refresh_home_aggregates_cache threw — home_aggregates_cache is now stale: ${String(err)}`,
    )
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
