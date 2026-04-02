/**
 * Registry Sync Bot — syncs from the official MCP Registry.
 * Pulls server metadata from registry.modelcontextprotocol.io
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'

const supabase = createAdminClient()

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
      const url = cursor
        ? `${REGISTRY_API}/servers?version=latest&cursor=${encodeURIComponent(cursor)}`
        : `${REGISTRY_API}/servers?version=latest`

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      })

      if (!res.ok) {
        console.error(`Registry API returned ${res.status}`)
        break
      }

      const data = await res.json()
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

  return new Set((data || []).map(s => s.github_url?.toLowerCase()))
}

async function main() {
  console.log('=== MCPpedia Registry Sync ===')
  console.log(new Date().toISOString())

  const registryServers = await fetchRegistryServers()
  console.log(`Fetched ${registryServers.length} servers from official registry`)

  if (registryServers.length === 0) {
    console.log('No servers returned from registry. Exiting.')
    return
  }

  const existingIds = await getExistingRegistryIds()
  const existingUrls = await getExistingGithubUrls()
  let synced = 0
  let updated = 0

  for (const rs of registryServers) {
    const githubUrl = rs.repository?.url || null
    const npmPackage = rs.packages?.find(p => p.registry_name === 'npm')?.name || null
    const pipPackage = rs.packages?.find(p => p.registry_name === 'pypi')?.name || null
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

    // Check if we already have this by GitHub URL
    if (githubUrl && existingUrls.has(githubUrl.toLowerCase())) {
      // Link existing server to registry
      await supabase
        .from('servers')
        .update({
          registry_id: rs.id,
          registry_synced_at: new Date().toISOString(),
          registry_verified: true,
        })
        .eq('github_url', githubUrl)
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

    // Insert new server
    const { error } = await supabase.from('servers').insert({
      slug,
      name: rs.name || slug,
      tagline: rs.description || null,
      github_url: githubUrl,
      npm_package: npmPackage,
      pip_package: pipPackage,
      transport,
      source: 'import',
      registry_id: rs.id,
      registry_synced_at: new Date().toISOString(),
      registry_verified: true,
      verified: false,
    })

    if (error) {
      console.error(`  Error inserting ${slug}: ${error.message}`)
    } else {
      console.log(`  New: ${slug}`)
      synced++
    }

    await new Promise(r => setTimeout(r, 50))
  }

  // Compute scores for newly synced servers
  console.log('Computing scores...')
  await supabase.rpc('compute_all_scores')

  console.log(`\nDone. New: ${synced}, Updated: ${updated}`)
}

main().catch(console.error)
