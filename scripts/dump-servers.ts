/**
 * Dump servers + security_advisories into trimmed, batched JSON files for
 * autonomous in-chat classification. See plan:
 *   .claude/plans/we-need-the-dump-serialized-fog.md
 *
 * Run:    npx tsx scripts/dump-servers.ts
 * Output: data/dumps/servers/batch-NNNN.json (200 rows each, score-desc)
 *         data/dumps/advisories/batch-NNNN.json (200 rows each, severity-desc)
 *         data/dumps/manifest.json
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BATCH_SIZE = 200
const PAGE_SIZE = 1000  // max per Supabase request
const ROOT = join(process.cwd(), 'data', 'dumps')

const SERVER_FIELDS = [
  'id', 'slug', 'name', 'tagline', 'description',
  'github_url', 'npm_package', 'pip_package', 'license',
  'author_name', 'author_github', 'author_type',
  'transport', 'compatible_clients', 'categories', 'tags',
  'tools',
  'api_name', 'api_pricing', 'requires_api_key',
  'github_stars', 'score_total', 'source',
].join(', ')

const ADVISORY_FIELDS = [
  'id', 'server_id', 'cve_id', 'severity', 'cvss_score',
  'title', 'description', 'affected_versions', 'fixed_version',
  'source_url', 'status',
].join(', ')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function trim(text: string | null | undefined, max: number): string | null {
  if (!text) return null
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

function trimServer(s: any) {
  return {
    slug: s.slug,
    name: s.name,
    tagline: s.tagline ?? null,
    description: trim(s.description, 500),
    github_url: s.github_url ?? null,
    npm_package: s.npm_package ?? null,
    pip_package: s.pip_package ?? null,
    license: s.license ?? null,
    author_name: s.author_name ?? null,
    author_github: s.author_github ?? null,
    author_type: s.author_type ?? null,
    transport: s.transport ?? [],
    compatible_clients: s.compatible_clients ?? [],
    categories: s.categories ?? [],
    tags: s.tags ?? [],
    tools: Array.isArray(s.tools)
      ? s.tools.slice(0, 8).map((t: any) => ({
          name: t?.name ?? null,
          desc: trim(t?.description ?? t?.desc ?? null, 100),
        }))
      : [],
    tool_count: Array.isArray(s.tools) ? s.tools.length : 0,
    api_name: s.api_name ?? null,
    api_pricing: s.api_pricing ?? null,
    requires_api_key: s.requires_api_key ?? null,
    github_stars: s.github_stars ?? 0,
    score_total: s.score_total ?? 0,
    source: s.source ?? null,
  }
}

function trimAdvisory(a: any, slugById: Map<string, { slug: string; name: string }>) {
  const meta = slugById.get(a.server_id)
  return {
    id: a.id,
    server_slug: meta?.slug ?? null,
    server_name: meta?.name ?? null,
    cve_id: a.cve_id ?? null,
    severity: a.severity ?? null,
    cvss_score: a.cvss_score ?? null,
    title: trim(a.title, 200),
    description: trim(a.description, 600),
    affected_versions: a.affected_versions ?? null,
    fixed_version: a.fixed_version ?? null,
    source_url: a.source_url ?? null,
    status: a.status ?? null,
  }
}

async function dumpServers() {
  mkdirSync(join(ROOT, 'servers'), { recursive: true })

  const all: any[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('servers')
      .select(SERVER_FIELDS)
      .order('score_total', { ascending: false, nullsFirst: false })
      .order('github_stars', { ascending: false, nullsFirst: false })
      .order('slug', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    console.log(`  fetched ${all.length} servers…`)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  console.log(`Total servers fetched: ${all.length}`)

  const idMap = new Map<string, { slug: string; name: string }>()
  for (const s of all) idMap.set(s.id, { slug: s.slug, name: s.name })

  const batches: { file: string; count: number; slugs: string[] }[] = []
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const chunk = all.slice(i, i + BATCH_SIZE).map(trimServer)
    const num = String(Math.floor(i / BATCH_SIZE) + 1).padStart(4, '0')
    const file = `servers/batch-${num}.json`
    writeFileSync(join(ROOT, file), JSON.stringify(chunk, null, 2))
    batches.push({ file, count: chunk.length, slugs: chunk.map(c => c.slug) })
  }
  console.log(`Wrote ${batches.length} server batches`)
  return { batches, idMap, total: all.length }
}

async function dumpAdvisories(idMap: Map<string, { slug: string; name: string }>) {
  mkdirSync(join(ROOT, 'advisories'), { recursive: true })

  const all: any[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('security_advisories')
      .select(ADVISORY_FIELDS)
      .order('severity', { ascending: false })
      .order('cvss_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    console.log(`  fetched ${all.length} advisories…`)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  console.log(`Total advisories fetched: ${all.length}`)

  const batches: { file: string; count: number }[] = []
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const chunk = all.slice(i, i + BATCH_SIZE).map(a => trimAdvisory(a, idMap))
    const num = String(Math.floor(i / BATCH_SIZE) + 1).padStart(4, '0')
    const file = `advisories/batch-${num}.json`
    writeFileSync(join(ROOT, file), JSON.stringify(chunk, null, 2))
    batches.push({ file, count: chunk.length })
  }
  console.log(`Wrote ${batches.length} advisory batches`)
  return { batches, total: all.length }
}

async function main() {
  console.log('Dumping servers…')
  const servers = await dumpServers()

  console.log('\nDumping advisories…')
  const advisories = await dumpAdvisories(servers.idMap)

  const manifest = {
    generated_at: new Date().toISOString(),
    batch_size: BATCH_SIZE,
    total_servers: servers.total,
    total_advisories: advisories.total,
    server_batches: servers.batches.map(b => ({ file: b.file, count: b.count })),
    advisory_batches: advisories.batches,
    ordering: {
      servers: 'score_total DESC, github_stars DESC NULLS LAST, slug ASC',
      advisories: 'severity DESC, cvss_score DESC NULLS LAST, id ASC',
    },
  }
  writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('\nManifest written:', join(ROOT, 'manifest.json'))
  console.log(`Done. ${servers.total} servers in ${servers.batches.length} batches; ${advisories.total} advisories in ${advisories.batches.length} batches.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
