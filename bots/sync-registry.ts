/**
 * Registry Sync Bot — syncs from the official MCP Registry.
 * Pulls server metadata from registry.modelcontextprotocol.io
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { categorize, inferAuthorType, inferCompatibleClients, inferPricing } from './lib/categorize'
import { normalizeGithubUrl, normalizePackageName } from '../lib/normalize'

const supabase = createAdminClient('bot-sync-registry')

const REGISTRY_API = 'https://registry.modelcontextprotocol.io/v0.1'

interface RegistryServer {
  id: string
  name: string
  description?: string
  repository?: { url: string; source: string }
  version_detail?: { version: string }
  packages?: Array<{
    registry_name: string
    name: string
    version: string
  }>
  remotes?: Array<{
    transport: string[]
    url: string
  }>
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@[\w-]+\//, '')    // strip npm scope
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function fetchRegistryServers(): Promise<RegistryServer[]> {
  const all: RegistryServer[] = []
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
        break
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      const raw = data.servers || data.items || (Array.isArray(data) ? data : [])
      // Registry wraps each entry in { server, _meta } — unwrap
      const servers = raw.map((entry: { server?: RegistryServer }) => entry.server || entry).filter(Boolean)
      if (servers.length === 0) break

      all.push(...servers)
      console.log(`  Fetched ${all.length} servers so far...`)

      // Check for pagination cursor
      cursor = data.metadata?.nextCursor || data.cursor || null
      if (!cursor) break

      await new Promise(r => setTimeout(r, 200))
    }
  } catch (err) {
    console.error('Failed to fetch from registry:', err)
  }

  return all
}

async function getExistingRegistryIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from('servers')
    .select('registry_id')
    .not('registry_id', 'is', null)

  return new Set((data || []).map(s => s.registry_id))
}

async function getExistingGithubUrls(): Promise<Set<string>> {
  const { data } = await supabase
    .from('servers')
    .select('github_url')
    .not('github_url', 'is', null)

  return new Set(
    (data || [])
      .map(s => normalizeGithubUrl(s.github_url))
      .filter((u): u is string => !!u)
  )
}

async function main() {
  const run = await BotRun.start('sync-registry')
  try {
  console.log('=== MCPpedia Registry Sync ===')
  console.log(new Date().toISOString())

  const registryServers = await fetchRegistryServers()
  console.log(`Fetched ${registryServers.length} servers from official registry`)
  run.addProcessed(registryServers.length)

  if (registryServers.length === 0) {
    console.log('No servers returned from registry. Exiting.')
    return
  }

  const existingIds = await getExistingRegistryIds()
  const existingUrls = await getExistingGithubUrls()
  let synced = 0
  let updated = 0
  let duplicates = 0
  let insertFailures = 0

  for (const rs of registryServers) {
    const githubUrl = normalizeGithubUrl(rs.repository?.url)
    const npmPackage = normalizePackageName(rs.packages?.find(p => p.registry_name === 'npm')?.name)
    const pipPackage = normalizePackageName(rs.packages?.find(p => p.registry_name === 'pypi')?.name)
    const transport = rs.remotes?.flatMap(r => r.transport) || ['stdio']

    // Check if already synced
    if (rs.id && existingIds.has(rs.id)) {
      // Update registry_synced_at
      await supabase
        .from('servers')
        .update({ registry_synced_at: new Date().toISOString() })
        .eq('registry_id', rs.id)
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
            registry_id: rs.id,
            registry_synced_at: new Date().toISOString(),
            registry_verified: true,
          })
          .eq('id', target.id)
      }
      updated++
      continue
    }

    // New server from registry
    if (!rs.name && !rs.id) continue
    const slug = slugify(rs.name || rs.id || 'unknown')

    const { data: existingSlug } = await supabase
      .from('servers')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existingSlug) {
      // Link by slug match
      await supabase
        .from('servers')
        .update({
          registry_id: rs.id,
          registry_synced_at: new Date().toISOString(),
          registry_verified: true,
        })
        .eq('slug', slug)
      updated++
      continue
    }

    // Auto-categorize from name + description
    const categories = categorize(rs.name || slug, rs.description)

    // Insert new server
    const { error } = await supabase.from('servers').insert({
      slug,
      name: rs.name || slug,
      tagline: rs.description || null,
      github_url: githubUrl,
      npm_package: npmPackage,
      pip_package: pipPackage,
      transport,
      compatible_clients: inferCompatibleClients(),
      api_pricing: inferPricing(null, rs.name || slug, rs.description),
      author_type: inferAuthorType(githubUrl ? githubUrl.split('/').slice(-2, -1)[0] : null, githubUrl),
      categories,
      source: 'import',
      registry_id: rs.id,
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
