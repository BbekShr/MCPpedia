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
}

async function fetchRegistryServers(): Promise<FetchResult> {
  const all: ParsedRegistryServer[] = []
  const skipped: Record<SkipReason, number> = {
    'not-latest': 0,
    'inactive-status': 0,
    'no-name': 0,
  }
  // Both failure paths below used to swallow into a bare `[]`, so main() read a
  // total registry outage as "the registry is empty" and exited green. Report
  // the outage separately from the count so the caller can tell them apart.
  let fetchFailed = false
  let cursor: string | null = null

  try {
    while (true) {
      const fetchUrl: string = cursor
        ? `${REGISTRY_API}/servers?version=latest&cursor=${encodeURIComponent(cursor)}`
        : `${REGISTRY_API}/servers?version=latest`

      const res: Response = await fetch(fetchUrl, {
        headers: { Accept: 'application/json' },
      })

      if (!res.ok) {
        console.error(`Registry API returned ${res.status}`)
        fetchFailed = true
        break
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      const { entries, nextCursor } = parseRegistryPage(data)
      // Break on empty ENTRIES, not on parsed servers: a page where every record
      // is superseded or inactive is still a valid page, and stopping there
      // would truncate pagination and silently drop the rest of the catalog.
      if (entries.length === 0) break

      for (const entry of entries) {
        const parsed = parseRegistryEntry(entry)
        if (parsed.kind === 'ok') all.push(parsed.server)
        else skipped[parsed.reason]++
      }
      console.log(`  Fetched ${all.length} servers so far...`)

      // Check for pagination cursor
      cursor = nextCursor
      if (!cursor) break

      await new Promise(r => setTimeout(r, 200))
    }
  } catch (err) {
    console.error('Failed to fetch from registry:', err)
    fetchFailed = true
  }

  return { servers: all, skipped, fetchFailed }
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
 */
async function getExistingRegistryRowIds(): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ id: string; registry_id: string }>(
    supabase.from('servers').select('id, registry_id').not('registry_id', 'is', null).order('id')
  )
  return new Map(rows.map(s => [s.registry_id, s.id]))
}

async function getExistingGithubUrls(): Promise<Set<string>> {
  const rows = await fetchAllRows<{ github_url: string }>(
    supabase.from('servers').select('github_url').not('github_url', 'is', null).order('id')
  )
  return new Set(
    rows
      .map(s => normalizeGithubUrl(s.github_url))
      .filter((u): u is string => !!u)
  )
}

async function main() {
  const run = await BotRun.start('sync-registry')
  try {
  console.log('=== MCPpedia Registry Sync ===')
  console.log(new Date().toISOString())

  const { servers: registryServers } = await fetchRegistryServers()
  console.log(`Fetched ${registryServers.length} servers from official registry`)
  run.addProcessed(registryServers.length)

  if (registryServers.length === 0) {
    console.log('No servers returned from registry. Exiting.')
    return
  }

  const existingRowIds = await getExistingRegistryRowIds()
  const existingUrls = await getExistingGithubUrls()
  let synced = 0
  let updated = 0
  let duplicates = 0
  let insertFailures = 0

  for (const parsed of registryServers) {
    const githubUrl = parsed.githubUrl

    // Check if already synced
    const existingRowId = existingRowIds.get(parsed.registryId)
    if (existingRowId) {
      // Update registry_synced_at
      await supabase
        .from('servers')
        .update({ registry_synced_at: new Date().toISOString() })
        .eq('id', existingRowId)
      updated++
      continue
    }

    // Check if we already have this by GitHub URL (normalized)
    if (githubUrl && existingUrls.has(githubUrl)) {
      // Link existing server to registry. Match against any URL form that
      // normalizes to ours, since older rows may not be normalized yet.
      const { data: matches } = await supabase
        .from('servers')
        .select('id, github_url')
        .ilike('github_url', `%${githubUrl.replace(/^https:\/\//, '')}%`)

      const target = (matches || []).find(m => normalizeGithubUrl(m.github_url) === githubUrl)
      if (target) {
        await supabase
          .from('servers')
          .update({
            registry_id: parsed.registryId,
            registry_synced_at: new Date().toISOString(),
            registry_verified: true,
          })
          .eq('id', target.id)
      }
      updated++
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

    // Insert new server
    const { error } = await supabase.from('servers').insert({
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
    })

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
      synced++
    }

    await new Promise(r => setTimeout(r, 50))
  }

  // Note: scores are computed by the dedicated compute-scores bot (runs at 5am UTC)
  // which uses real CVE scanning, token measurement, and README analysis.
  // The SQL compute_all_scores() function uses simpler heuristics and different weights,
  // so we don't call it here to avoid overwriting accurate scores.

  run.setSummary({ new: synced, updated, duplicates, insertFailures })
  run.addUpdated(synced + updated)
  console.log(`\nDone. New: ${synced}, Updated: ${updated}, Duplicates: ${duplicates}, Failures: ${insertFailures}`)
  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
