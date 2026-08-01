/**
 * Registry Sync Bot — syncs from the official MCP Registry.
 * Pulls server metadata from registry.modelcontextprotocol.io
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient, fetchAllRows } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { categorize, inferAuthorType, inferCompatibleClients, inferPricing } from './lib/categorize'
import { normalizeGithubUrl } from '../lib/normalize'
import {
  parseRegistryPage,
  parseRegistryEntry,
  type ParsedRegistryServer,
  type SkipReason,
} from '../lib/registry-schema'
import { planRegistryRowWrite } from '../lib/registry-sync-plan'

/** Mirrors the per-page retry in bots/lib/supabase.ts `fetchAllRows`. */
const PAGE_FETCH_ATTEMPTS = 3

/**
 * Hard ceiling on pages per run — the last stop against a looping cursor.
 *
 * The no-progress check below only catches an immediate self-repeat; an
 * alternating `A→B→A→B` cursor walks past it forever with `all` growing
 * unbounded. `.github/workflows/sync-registry.yml` sets no `timeout-minutes`,
 * so GitHub's 6-hour default is otherwise the only thing that stops it. At 25-30
 * records a page this is ~50k records, well past the live catalog.
 */
const MAX_REGISTRY_PAGES = 2000

/** Bounds on the publisher-controlled strings echoed into the run summary. */
const MAX_UNMAPPED_TRANSPORTS = 20
const MAX_UNMAPPED_TRANSPORT_LEN = 64

const supabase = createAdminClient('bot-sync-registry')

const REGISTRY_API = 'https://registry.modelcontextprotocol.io/v0.1'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@[\w-]+\//, '')    // strip npm scope
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

type FetchResult = {
  servers: ParsedRegistryServer[]
  skipped: Record<SkipReason, number>
  fetchFailed: boolean
  unmappedTransports: string[]
}

/**
 * One page, retried on transient failure, or `null` once the attempts run out.
 *
 * A full sync is hundreds of sequential pages (25 records each), so a single
 * flaky response is close to certain over a run. Without this retry any one of
 * them aborted the whole fetch, which turned "syncs most nights" into "syncs
 * only on a perfectly clean night". Backoff shape mirrors `fetchAllRows`
 * (bots/lib/supabase.ts:52-63).
 */
async function fetchRegistryPage(url: string): Promise<unknown | null> {
  for (let attempt = 1; ; attempt++) {
    let failure: string
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (res.ok) return await res.json()
      failure = `HTTP ${res.status}`
    } catch (err) {
      failure = String(err)
    }
    if (attempt >= PAGE_FETCH_ATTEMPTS) {
      console.error(`Registry page failed after ${attempt} attempts (${failure}): ${url}`)
      return null
    }
    const backoffMs = 2000 * 2 ** (attempt - 1) // 2s, 4s
    console.warn(`  Registry page failed (${failure}) — retrying in ${backoffMs / 1000}s (attempt ${attempt}/${PAGE_FETCH_ATTEMPTS})`)
    await new Promise(r => setTimeout(r, backoffMs))
  }
}

async function fetchRegistryServers(): Promise<FetchResult> {
  const all: ParsedRegistryServer[] = []
  const skipped: Record<SkipReason, number> = {
    'not-latest': 0,
    'inactive-status': 0,
    'no-name': 0,
    malformed: 0,
  }
  const unmappedTransports = new Set<string>()
  // Both failure paths below used to swallow into a bare `[]`, so main() read a
  // total registry outage as "the registry is empty" and exited green. Report
  // the outage separately from the count so the caller can tell them apart — and
  // so a PARTIAL failure can still write the pages that did arrive.
  let fetchFailed = false
  let cursor: string | null = null

  for (let page = 1; ; page++) {
    if (page > MAX_REGISTRY_PAGES) {
      console.error(`Registry pagination exceeded ${MAX_REGISTRY_PAGES} pages — aborting`)
      fetchFailed = true
      break
    }
    const fetchUrl: string = cursor
      ? `${REGISTRY_API}/servers?version=latest&cursor=${encodeURIComponent(cursor)}`
      : `${REGISTRY_API}/servers?version=latest`

    const data = await fetchRegistryPage(fetchUrl)
    if (data === null) {
      fetchFailed = true
      break
    }

    const { entries, nextCursor } = parseRegistryPage(data)
    // Break on empty ENTRIES, not on parsed servers: a page where every record
    // is superseded or inactive is still a valid page, and stopping there
    // would truncate pagination and silently drop the rest of the catalog.
    if (entries.length === 0) {
      // ...but an empty page that still advertises a NEW cursor is not the end
      // of the catalog. parseRegistryPage also returns `entries: []` when
      // `servers` is present but not an array, so this shape is how a mid-run
      // payload change would otherwise write SUCCESS having read 0.2% of it.
      // An empty terminal page that merely ECHOES the cursor we sent is not a
      // fault, and the no-progress check below cannot rescue it (it only runs
      // when entries arrived) — so it would have reddened every healthy run.
      if (nextCursor && nextCursor !== cursor) {
        console.error(`Registry returned 0 entries but a nextCursor (${nextCursor}) — treating as a failure`)
        fetchFailed = true
      }
      break
    }

    for (const entry of entries) {
      // Belt and braces with the typeof guards inside parseRegistryEntry: an
      // uncaught throw here would escape into a "registry outage" that is
      // really one malformed record, and it would repeat nightly.
      try {
        const parsed = parseRegistryEntry(entry)
        if (parsed.kind !== 'ok') {
          skipped[parsed.reason]++
          continue
        }
        all.push(parsed.server)
        // `remote.type` is free text from a third party and this set is joined
        // into the `bot_runs.summary` jsonb, whose write is not error-checked
        // (bots/lib/bot-run.ts:57-63) — an oversized summary would fail the
        // write silently. A rename needs a handful of samples, not every value.
        for (const t of parsed.server.unmappedTransports) {
          if (unmappedTransports.size >= MAX_UNMAPPED_TRANSPORTS) break
          unmappedTransports.add(t.slice(0, MAX_UNMAPPED_TRANSPORT_LEN))
        }
      } catch (err) {
        console.warn(`  Skipped a malformed registry record: ${String(err)}`)
        skipped.malformed++
      }
    }
    console.log(`  Fetched ${all.length} servers so far...`)

    // Check for pagination cursor
    if (!nextCursor) break
    // A cursor that repeats the one we just sent is an infinite loop with
    // unbounded memory growth. This catches only the immediate self-repeat —
    // an alternating cursor slips past it, which is what MAX_REGISTRY_PAGES
    // above is for.
    if (nextCursor === cursor) {
      console.error(`Registry repeated cursor ${nextCursor} — aborting pagination`)
      fetchFailed = true
      break
    }
    cursor = nextCursor

    await new Promise(r => setTimeout(r, 200))
  }

  return { servers: all, skipped, fetchFailed, unmappedTransports: [...unmappedTransports] }
}

/**
 * Map registry_id -> servers.id for every already-synced row.
 *
 * Keyed on the primary key rather than `registry_id` because `servers.registry_id`
 * has NO index (plain nullable text,
 * `supabase/migrations/20260402010000_scores_security_registry.sql:28`). Now that
 * the fast path below is reachable for the first time, an update filtered on
 * `registry_id` would seq-scan a ~39k-row table once per already-synced server.
 *
 * No backfill script is needed to populate `registry_id`: the GitHub-URL link
 * branch already writes it, so one nightly run self-heals every existing row.
 *
 * Archived rows are excluded. bots/detect-duplicates.ts ARCHIVES duplicates
 * instead of deleting them, and `CURATED_FIELDS` (lib/curated-merge.ts) does not
 * carry `registry_id`/`registry_verified` over to the keeper — so without this
 * filter an entry binds permanently to an invisible row, refreshing its
 * `registry_synced_at` nightly while the live keeper never gets the badge.
 */
type ExistingRegistryRow = { id: string; githubUrl: string | null }

async function getExistingRegistryRowIds(): Promise<Map<string, ExistingRegistryRow>> {
  const rows = await fetchAllRows<{ id: string; registry_id: string; github_url: string | null }>(
    supabase
      .from('servers')
      .select('id, registry_id, github_url')
      .not('registry_id', 'is', null)
      .eq('is_archived', false)
      .order('id')
  )
  return new Map(rows.map(s => [s.registry_id, { id: s.id, githubUrl: s.github_url }]))
}

/**
 * Escape LIKE metacharacters so an interpolated URL is matched literally.
 *
 * `%`/`_` in a stored or registry-supplied URL would otherwise widen the pattern
 * — in the `%` case to a catalog-wide match that PostgREST truncates at 1000
 * rows, so the exact-equality `find` below misses and the link is silently
 * dropped while still being counted. The `.ilike` is only a prefilter; the
 * `find` is the real filter.
 */
function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, m => `\\${m}`)
}

/**
 * Every repo URL held by a LIVE row, normalized.
 *
 * Archived rows are excluded for the same reason `getExistingRegistryRowIds`
 * excludes them, and the exclusion has to be on BOTH reads to do anything:
 * bots/detect-duplicates.ts archives the loser by setting `is_archived` and
 * nothing else (`detect-duplicates.ts:253-256`), so the archived row keeps a
 * `github_url` identical to the keeper's. With archived rows in this set — and
 * in the `.ilike` prefilter that follows — PostgREST returns both rows in an
 * unordered result and `.find` binds to whichever came first, re-stamping an
 * invisible row on roughly half of all nights and paying the ~63k-row scan
 * again the next.
 */
async function getExistingGithubUrls(): Promise<Set<string>> {
  const rows = await fetchAllRows<{ github_url: string }>(
    supabase
      .from('servers')
      .select('github_url')
      .not('github_url', 'is', null)
      .eq('is_archived', false)
      .order('id')
  )
  return new Set(
    rows
      .map(s => normalizeGithubUrl(s.github_url))
      .filter((u): u is string => !!u)
  )
}

/**
 * The LIVE row whose `github_url` normalizes to `githubUrl`, or null.
 *
 * The `.ilike` is only a prefilter — older rows may store an un-normalized URL
 * form, so the exact match is the `find`. It excludes archived rows for the
 * reason spelled out on `getExistingGithubUrls`: an archived duplicate keeps the
 * keeper's URL verbatim, and PostgREST returns the two in no defined order.
 */
async function findLiveRowByGithubUrl(githubUrl: string): Promise<{ id: string } | null> {
  const { data: matches } = await supabase
    .from('servers')
    .select('id, github_url')
    .eq('is_archived', false)
    .ilike('github_url', `%${escapeLikeValue(githubUrl.replace(/^https:\/\//, ''))}%`)

  return (matches || []).find(m => normalizeGithubUrl(m.github_url) === githubUrl) ?? null
}

async function main() {
  const run = await BotRun.start('sync-registry')
  try {
  console.log('=== MCPpedia Registry Sync ===')
  console.log(new Date().toISOString())

  const { servers: fetched, skipped, fetchFailed, unmappedTransports } = await fetchRegistryServers()

  // `registryId` is the registry `name`, which can legitimately repeat within a
  // run (page-boundary overlap, or every version of a server if `isLatest` ever
  // stops being emitted). `existingRowIds` is snapshotted before the write loop,
  // so a repeat would insert a SECOND row with the same registry_id and the next
  // run's `new Map(...)` would keep only one — freezing the other forever.
  const byRegistryId = new Map<string, ParsedRegistryServer>()
  for (const s of fetched) if (!byRegistryId.has(s.registryId)) byRegistryId.set(s.registryId, s)
  const registryServers = [...byRegistryId.values()]
  const duplicateEntries = fetched.length - registryServers.length

  console.log(`Fetched ${registryServers.length} servers from official registry`)
  run.addProcessed(registryServers.length)

  // `mapped 0 of N` is the schema-drift signature, so it has to be measured over
  // every parsed record — not accumulated inside the write loop, where the fast
  // path and the duplicate path both `continue` before reaching it.
  const mappedPackages = registryServers.filter(s => s.hasMappedPackage).length

  const baseSummary = {
    fetchFailed,
    fetched: registryServers.length,
    duplicateEntries,
    mappedPackages,
    unmappedTransports: unmappedTransports.join(',') || null,
    skippedNotLatest: skipped['not-latest'],
    skippedInactive: skipped['inactive-status'],
    skippedNoName: skipped['no-name'],
    skippedMalformed: skipped.malformed,
  }

  // This used to be a bare `return` inside the try, which skipped both
  // setSummary and finish() — leaving an orphaned bot_runs row stuck at
  // status:'running', exit code 0 and a green workflow. A total registry outage
  // read as a healthy night. `run.fail` sets process.exitCode = 1
  // (bots/lib/bot-run.ts:71), which turns the Registry Sync workflow red for
  // .github/workflows/alert-on-failure.yml to pick up.
  //
  // Only a TOTAL fetch failure aborts here. A partial one falls through to the
  // write loop and fails after it: nothing in the loop is destructive (no
  // deletes, no archiving), so committing the pages that did arrive is strictly
  // better than discarding a night's work over one bad page.
  if (registryServers.length === 0) {
    const reason = fetchFailed
      ? 'registry fetch failed — see the logged status/error above'
      : 'registry returned 0 ingestable servers'
    console.error(`${reason}. Failing the run.`)
    run.setSummary(baseSummary)
    await run.fail(reason)
    return
  }

  // Row counts alone cannot tell schema drift from a quiet upstream: a renamed
  // package field yields N records and 0 packages, which every count-based check
  // reads as success. This guard runs BEFORE the catalog walk and the write loop
  // — everything it needs is known at parse time, and on a drift night the loop
  // would otherwise insert thousands of the corrupt NULL-package rows the guard
  // exists to prevent, then fail, then repeat tomorrow.
  //
  // It needs NO self-releasing age bound (unlike the >20% guard in
  // bots/snapshot-metrics.ts) because it compares against the live payload
  // rather than a stored row — a fixed upstream releases it on the next run.
  if (mappedPackages === 0) {
    // On a partial fetch the sample is whatever arrived before the failure, so
    // "0 packages" may just be a short read. Name that first: `fetchFailed` is
    // in the summary, but `error_message` is what a human reads.
    const reason = fetchFailed
      ? `registry fetch was partial AND mapped 0 npm/pip packages across the ${registryServers.length} records that arrived — treat the partial fetch as the cause first`
      : `mapped 0 npm/pip packages across ${registryServers.length} registry records — schema drift`
    console.error(`\n${reason}`)
    run.setSummary(baseSummary)
    await run.fail(reason)
    return
  }

  const existingRowIds = await getExistingRegistryRowIds()
  const existingUrls = await getExistingGithubUrls()
  let synced = 0
  let updated = 0
  let linkMisses = 0
  let duplicates = 0
  let insertFailures = 0

  for (const parsed of registryServers) {
    const githubUrl = parsed.githubUrl

    // Which row this entry belongs on. The rule the plan enforces: an entry we
    // can already identify by `registry_id` NEVER reaches the insert below.
    const plan = await planRegistryRowWrite({
      githubUrl,
      existingRow: existingRowIds.get(parsed.registryId),
      urlInCatalog: !!githubUrl && existingUrls.has(githubUrl),
      normalizeUrl: normalizeGithubUrl,
      findRowByUrl: findLiveRowByGithubUrl,
    })

    if (plan.kind !== 'insert') {
      const stamp = { registry_synced_at: new Date().toISOString(), registry_verified: true }
      switch (plan.kind) {
        case 'refresh':
          // `registry_verified` is written here too, not just on first link: it
          // was otherwise set exactly once, so any row that missed it stayed stuck.
          await supabase.from('servers').update(stamp).eq('id', plan.id)
          updated++
          break
        case 'adopt':
          await supabase
            .from('servers')
            .update({ ...stamp, github_url: plan.githubUrl })
            .eq('id', plan.id)
          existingRowIds.set(parsed.registryId, { id: plan.id, githubUrl: plan.githubUrl })
          updated++
          break
        case 'relink':
          // Clear the identity off the old row FIRST. `registry_id` has no unique
          // index, so leaving it on both rows lets the next run's `new Map(...)`
          // pick the stale one back up and re-link forever.
          if (plan.clearRegistryIdOn) {
            await supabase
              .from('servers')
              .update({ registry_id: null, registry_verified: false })
              .eq('id', plan.clearRegistryIdOn)
          }
          await supabase
            .from('servers')
            .update({ ...stamp, registry_id: parsed.registryId })
            .eq('id', plan.targetId)
          existingRowIds.set(parsed.registryId, { id: plan.targetId, githubUrl })
          updated++
          break
        case 'linkMiss':
          // The URL is in `existingUrls` but no row survived exact-equality
          // matching. Counting this as "updated" hid a nightly no-op that still
          // pays a full seq scan of ~63k rows.
          if (plan.refreshId) await supabase.from('servers').update(stamp).eq('id', plan.refreshId)
          linkMisses++
          break
      }
      continue
    }

    // New server from registry
    if (!parsed.name) continue
    const baseSlug = slugify(parsed.name)

    // Resolve a free slug. A bare slug collision is NOT treated as "the same
    // server": GitHub-URL matches were already linked above, so anything
    // reaching here with a slug clash is a *distinct* server. Linking the
    // official registry entry onto whichever row happened to hold the slug
    // merged official servers onto unrelated third-party listings and hid them
    // from search (issue #25) — e.g. an official `@org/foo-mcp` swallowed by a
    // third-party `foo mcp`. Give the official entry its own slug instead; the
    // detect-duplicates bot can still merge genuine duplicates later.
    let slug = baseSlug
    const owner = githubUrl ? slugify(githubUrl.split('/').slice(-2, -1)[0] || '') : ''
    const slugCandidates = [
      baseSlug,
      owner ? `${baseSlug}-${owner}` : '',
      `${baseSlug}-2`,
      `${baseSlug}-3`,
      `${baseSlug}-4`,
    ].filter((v, i, a) => v && a.indexOf(v) === i)

    let resolvedSlug: string | null = null
    for (const cand of slugCandidates) {
      const { data: taken } = await supabase
        .from('servers')
        .select('id')
        .eq('slug', cand)
        .maybeSingle()
      if (!taken) { resolvedSlug = cand; break }
    }
    if (!resolvedSlug) {
      console.warn(`  Skipped ${baseSlug} (could not resolve a free slug)`)
      duplicates++
      continue
    }
    slug = resolvedSlug

    // Auto-categorize from name + description
    const categories = categorize(parsed.name || slug, parsed.description ?? undefined)

    // Insert new server. The id comes back so `existingRowIds` can absorb it —
    // the map was snapshotted before the loop, and a registry `name` repeating
    // later in the same run would otherwise insert a second row for it.
    const { data: inserted, error } = await supabase.from('servers').insert({
      slug,
      name: parsed.name || slug,
      tagline: parsed.description || null,
      github_url: githubUrl,
      npm_package: parsed.npmPackage,
      pip_package: parsed.pipPackage,
      transport: parsed.transports,
      compatible_clients: inferCompatibleClients(),
      api_pricing: inferPricing(null, parsed.name || slug, parsed.description ?? undefined),
      author_type: inferAuthorType(githubUrl ? githubUrl.split('/').slice(-2, -1)[0] : null, githubUrl),
      categories,
      source: 'import',
      registry_id: parsed.registryId,
      registry_synced_at: new Date().toISOString(),
      registry_verified: true,
      verified: false,
    }).select('id').single()

    if (error) {
      // 23505 = unique_violation. With the dedup indexes, this means a parallel
      // path raced us or our normalizer disagreed with the index expression —
      // both are signals worth surfacing, but neither should fail the whole run.
      if (error.code === '23505') {
        console.warn(`  Skipped ${slug} (duplicate): ${error.message}`)
        duplicates++
      } else {
        console.error(`  Error inserting ${slug}: ${error.message}`)
        insertFailures++
      }
    } else {
      console.log(`  New: ${slug}`)
      if (inserted) existingRowIds.set(parsed.registryId, { id: inserted.id, githubUrl })
      synced++
    }

    await new Promise(r => setTimeout(r, 50))
  }

  // Note: scores are computed by the dedicated compute-scores bot (runs at 5am UTC)
  // which uses real CVE scanning, token measurement, and README analysis.
  // The SQL compute_all_scores() function uses simpler heuristics and different weights,
  // so we don't call it here to avoid overwriting accurate scores.

  run.setSummary({
    ...baseSummary,
    new: synced,
    updated,
    linkMisses,
    duplicates,
    insertFailures,
  })
  run.addUpdated(synced + updated)
  console.log(`\nDone. New: ${synced}, Updated: ${updated}, Link misses: ${linkMisses}, Duplicates: ${duplicates}, Failures: ${insertFailures}`)

  // A partial fetch still alarms — but only now that the pages that did arrive
  // have been written.
  if (fetchFailed) {
    const reason = 'registry fetch was partial — see the logged status/error above'
    console.error(reason)
    await run.fail(reason)
    return
  }
  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
