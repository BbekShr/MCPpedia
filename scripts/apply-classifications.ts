/**
 * Apply curated classifications back to Supabase. See plan:
 *   .claude/plans/we-need-the-dump-serialized-fog.md
 *
 * Reads:
 *   data/classifications/servers/batch-NNNN.json   (keyed by slug)
 *   data/classifications/advisories/batch-NNNN.json (keyed by advisory id)
 *
 * Writes diffs to:
 *   - servers table (categories, transport, compatible_clients, author_type, api_pricing, tags)
 *   - security_advisories table (severity, status)
 *   - data/classifications/audit-log.jsonl (one line per row updated)
 *
 * After updates, calls compute_server_score(p_server_id) RPC for each touched
 * server to refresh score_compatibility / score_security / score_total.
 *
 * Run:
 *   npx tsx scripts/apply-classifications.ts            # apply for real
 *   npx tsx scripts/apply-classifications.ts --dry-run  # print diffs only
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SERVER_DIR = join(ROOT, 'data', 'classifications', 'servers')
const ADVISORY_DIR = join(ROOT, 'data', 'classifications', 'advisories')
const AUDIT_LOG = join(ROOT, 'data', 'classifications', 'audit-log.jsonl')

const DRY_RUN = process.argv.includes('--dry-run')
const ACTOR_LABEL = 'admin-bulk-classify'

const SERVER_FIELDS = [
  'categories', 'transport', 'compatible_clients',
  'author_type', 'api_pricing', 'tags',
] as const
type ServerField = typeof SERVER_FIELDS[number]

const ADVISORY_FIELDS = ['severity', 'status'] as const
type AdvisoryField = typeof ADVISORY_FIELDS[number]

const CATEGORIES = new Set(['productivity','developer-tools','data','finance','ai-ml','communication','cloud','security','analytics','design','devops','education','entertainment','health','marketing','search','writing','maps','ecommerce','legal','browser','other'])
const TRANSPORTS = new Set(['stdio', 'sse', 'http'])
const CLIENTS = new Set(['claude-desktop', 'cursor', 'claude-code', 'windsurf', 'other'])
const AUTHOR_TYPES = new Set(['official', 'community', 'unknown'])
const PRICING = new Set(['free', 'freemium', 'paid', 'unknown'])
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info'])
const STATUSES = new Set(['open', 'fixed', 'wont_fix', 'disputed'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { 'x-actor-label': ACTOR_LABEL } } }
)

function arraysEqual(a: any, b: any): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function loadClassificationFiles(dir: string): Record<string, any> {
  if (!existsSync(dir)) return {}
  const merged: Record<string, any> = {}
  const files = readdirSync(dir).filter(f => /^batch-\d+\.json$/.test(f)).sort()
  for (const f of files) {
    const content = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
    for (const [key, value] of Object.entries(content)) {
      if (key in merged) {
        console.warn(`  [warn] duplicate key '${key}' across batches; keeping first`)
        continue
      }
      merged[key] = value
    }
  }
  return merged
}

function validateServerEntry(slug: string, entry: any): string | null {
  if (!entry || typeof entry !== 'object') return 'not an object'
  if (entry.categories) {
    if (!Array.isArray(entry.categories)) return 'categories not array'
    const bad = entry.categories.filter((c: string) => !CATEGORIES.has(c))
    if (bad.length) return `invalid categories: ${bad.join(',')}`
  }
  if (entry.transport) {
    if (!Array.isArray(entry.transport)) return 'transport not array'
    const bad = entry.transport.filter((t: string) => !TRANSPORTS.has(t))
    if (bad.length) return `invalid transport: ${bad.join(',')}`
  }
  if (entry.compatible_clients) {
    if (!Array.isArray(entry.compatible_clients)) return 'compatible_clients not array'
    const bad = entry.compatible_clients.filter((c: string) => !CLIENTS.has(c))
    if (bad.length) return `invalid compatible_clients: ${bad.join(',')}`
  }
  if (entry.author_type && !AUTHOR_TYPES.has(entry.author_type)) {
    return `invalid author_type: ${entry.author_type}`
  }
  if (entry.api_pricing && !PRICING.has(entry.api_pricing)) {
    return `invalid api_pricing: ${entry.api_pricing}`
  }
  if (entry.tags && !Array.isArray(entry.tags)) return 'tags not array'
  return null
}

function validateAdvisoryEntry(id: string, entry: any): string | null {
  if (!entry || typeof entry !== 'object') return 'not an object'
  if (entry.severity && !SEVERITIES.has(entry.severity)) return `invalid severity: ${entry.severity}`
  if (entry.status && !STATUSES.has(entry.status)) return `invalid status: ${entry.status}`
  return null
}

async function applyServers() {
  const curated = loadClassificationFiles(SERVER_DIR)
  const slugs = Object.keys(curated)
  console.log(`\n=== SERVERS ===`)
  console.log(`Loaded ${slugs.length} curated entries`)

  // Validate up-front; bail loudly on any malformed entry rather than corrupting DB.
  const errors: string[] = []
  for (const slug of slugs) {
    const err = validateServerEntry(slug, curated[slug])
    if (err) errors.push(`${slug}: ${err}`)
  }
  if (errors.length) {
    console.error(`\n[fatal] ${errors.length} server entries failed validation:`)
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`)
    if (errors.length > 20) console.error(`  …and ${errors.length - 20} more`)
    process.exit(1)
  }

  const PAGE = 100
  let touched = 0, unchanged = 0, missing = 0, scoreUpdates: { id: string; slug: string }[] = []

  for (let i = 0; i < slugs.length; i += PAGE) {
    const slice = slugs.slice(i, i + PAGE)
    const { data, error } = await supabase
      .from('servers')
      .select('id, slug, categories, transport, compatible_clients, author_type, api_pricing, tags')
      .in('slug', slice)
    if (error) throw error

    const bySlug = new Map<string, any>(data!.map(r => [r.slug, r]))
    for (const slug of slice) {
      const cur = bySlug.get(slug)
      if (!cur) {
        missing++
        if (missing <= 10) console.warn(`  [skip] slug not in DB: ${slug}`)
        continue
      }
      const target = curated[slug]
      const update: Partial<Record<ServerField, any>> = {}
      const diff: Record<string, { from: any; to: any }> = {}

      for (const f of SERVER_FIELDS) {
        if (!(f in target)) continue
        const newVal = target[f]
        const oldVal = cur[f]
        const isArrayField = f !== 'author_type' && f !== 'api_pricing'
        const same = isArrayField ? arraysEqual(oldVal, newVal) : oldVal === newVal
        if (same) continue
        update[f] = newVal
        diff[f] = { from: oldVal, to: newVal }
      }

      if (Object.keys(update).length === 0) { unchanged++; continue }

      if (DRY_RUN) {
        console.log(`  [dry] ${slug}:`, diff)
      } else {
        const { error: upErr } = await supabase.from('servers').update(update).eq('id', cur.id)
        if (upErr) {
          console.error(`  [error] update ${slug}: ${upErr.message}`)
          continue
        }
        appendFileSync(AUDIT_LOG, JSON.stringify({
          ts: new Date().toISOString(), kind: 'server', id: cur.id, slug, diff,
        }) + '\n')
        scoreUpdates.push({ id: cur.id, slug })
      }
      touched++
    }
    console.log(`  processed ${Math.min(i + PAGE, slugs.length)}/${slugs.length} (touched=${touched} unchanged=${unchanged} missing=${missing})`)
  }

  if (!DRY_RUN && scoreUpdates.length) {
    console.log(`\nRecomputing scores for ${scoreUpdates.length} servers…`)
    let scored = 0
    for (const { id, slug } of scoreUpdates) {
      const { error } = await supabase.rpc('compute_server_score', { p_server_id: id })
      if (error) console.warn(`  [warn] score recompute ${slug}: ${error.message}`)
      scored++
      if (scored % 200 === 0) console.log(`    ${scored}/${scoreUpdates.length} rescored`)
    }
    console.log(`  ${scored} server scores recomputed`)
  }

  console.log(`Servers done: touched=${touched}, unchanged=${unchanged}, missing=${missing}`)
}

async function applyAdvisories() {
  const curated = loadClassificationFiles(ADVISORY_DIR)
  const ids = Object.keys(curated)
  console.log(`\n=== ADVISORIES ===`)
  console.log(`Loaded ${ids.length} curated entries`)

  const errors: string[] = []
  for (const id of ids) {
    const err = validateAdvisoryEntry(id, curated[id])
    if (err) errors.push(`${id}: ${err}`)
  }
  if (errors.length) {
    console.error(`\n[fatal] ${errors.length} advisory entries failed validation:`)
    for (const e of errors.slice(0, 20)) console.error(`  ${e}`)
    process.exit(1)
  }

  const PAGE = 100
  let touched = 0, unchanged = 0, missing = 0
  const affectedServerIds = new Set<string>()

  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE)
    const { data, error } = await supabase
      .from('security_advisories')
      .select('id, server_id, severity, status')
      .in('id', slice)
    if (error) throw error

    const byId = new Map<string, any>(data!.map(r => [r.id, r]))
    for (const id of slice) {
      const cur = byId.get(id)
      if (!cur) {
        missing++
        if (missing <= 10) console.warn(`  [skip] advisory id not in DB: ${id}`)
        continue
      }
      const target = curated[id]
      const update: Partial<Record<AdvisoryField, any>> = {}
      const diff: Record<string, { from: any; to: any }> = {}

      for (const f of ADVISORY_FIELDS) {
        if (!(f in target)) continue
        const newVal = target[f]
        const oldVal = cur[f]
        if (oldVal === newVal) continue
        update[f] = newVal
        diff[f] = { from: oldVal, to: newVal }
      }

      if (Object.keys(update).length === 0) { unchanged++; continue }

      if (DRY_RUN) {
        console.log(`  [dry] ${id}:`, diff)
      } else {
        const { error: upErr } = await supabase.from('security_advisories').update(update).eq('id', cur.id)
        if (upErr) {
          console.error(`  [error] update advisory ${id}: ${upErr.message}`)
          continue
        }
        appendFileSync(AUDIT_LOG, JSON.stringify({
          ts: new Date().toISOString(), kind: 'advisory', id: cur.id, server_id: cur.server_id, diff,
        }) + '\n')
        affectedServerIds.add(cur.server_id)
      }
      touched++
    }
    console.log(`  processed ${Math.min(i + PAGE, ids.length)}/${ids.length} (touched=${touched} unchanged=${unchanged} missing=${missing})`)
  }

  if (!DRY_RUN && affectedServerIds.size > 0) {
    console.log(`\nRecomputing scores for ${affectedServerIds.size} servers (advisory severity changes)…`)
    let scored = 0
    for (const sid of affectedServerIds) {
      const { error } = await supabase.rpc('compute_server_score', { p_server_id: sid })
      if (error) console.warn(`  [warn] score recompute ${sid}: ${error.message}`)
      scored++
    }
    console.log(`  ${scored} server scores recomputed`)
  }

  console.log(`Advisories done: touched=${touched}, unchanged=${unchanged}, missing=${missing}`)
}

async function main() {
  console.log(DRY_RUN ? '** DRY RUN — no writes **' : '** APPLYING WRITES **')
  if (!DRY_RUN && !existsSync(AUDIT_LOG)) {
    writeFileSync(AUDIT_LOG, '')
  }
  await applyServers()
  await applyAdvisories()
  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
