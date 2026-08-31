/**
 * One-off corrections for six listings reported by their maintainers in
 * GitHub issues #68, #91, #108, #128, #130, #136 — verified individually
 * against the live official MCP Registry (registry.modelcontextprotocol.io)
 * before being hardcoded here. This is a point fix for the specific rows
 * filed; the recurring causes (dedup keeper selection, sync-registry never
 * refreshing linked rows, the FAQ/install UI asserting unknown facts) are
 * fixed in code separately — see PRs for issues #91/#136, #108/#128/#130,
 * and #68.
 *
 * `remote_url` is written only if the column already exists (it ships in a
 * separate migration for #68) — this script does not depend on PR ordering.
 *
 * Run:
 *   npx tsx scripts/fix-open-issues.ts --dry-run   # report only, no writes
 *   npx tsx scripts/fix-open-issues.ts             # apply
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'

import { createAdminClient } from '../bots/lib/supabase'

const supabase = createAdminClient('script-fix-open-issues')
const dryRun = process.argv.includes('--dry-run')

interface Fix {
  issue: number
  slug: string
  update: Record<string, unknown>
  note: string
}

// Values taken directly from the official registry records fetched
// 2026-08-30 (registry.modelcontextprotocol.io/v0/servers/<name>/versions/latest)
// and cross-checked against the live GitHub repos where the issue disputed
// the URL. Nothing here is inferred from the issue report alone.
const FIXES: Fix[] = [
  {
    issue: 136,
    slug: 'io-github-makeev-alphai-mcp',
    update: {
      is_archived: false,
      health_status: 'unknown',
      transport: ['streamable-http'],
      remote_url: 'https://mcp.alphai.io/mcp',
    },
    note: 'Registry status: active, last push today. Wrongly archived by detect-duplicates keeper randomness (S86); the row it was merged into (alphai-mcp) no longer exists, so this was the only live listing.',
  },
  {
    issue: 91,
    slug: 'net-convertica-mcp',
    update: {
      is_archived: false,
      health_status: 'unknown',
    },
    note: 'Curated, publisher-claimed row wrongly archived in favor of a now-deleted emptier duplicate (net-convertica-mcp-2). homepage_url/api_* were never lost — they stayed on this row. Just unarchiving.',
  },
  {
    issue: 130,
    slug: 'email-palisade-palisade',
    update: {
      github_url: 'https://github.com/palisadeemail/palisade-mcp',
      npm_package: '@palisadeemail/mcp',
      homepage_url: 'https://developer.palisade.email/docs/guide',
      remote_url: 'https://api.palisade.email/mcp',
      transport: ['stdio', 'streamable-http'],
      has_authentication: true,
      description: 'Monitor and manage email authentication (SPF, DKIM, DMARC, MTA-STS, BIMI) for your domains.',
    },
    note: 'Registry v1.0.2. Old github_url (palisadeemail/dns-auditor) predates a repo rename/split; no other row already claims the new URL (checked). Reporter also cited https://www.palisade.email/mcp as the product page — registry\'s own websiteUrl (developer.palisade.email/docs/guide) used here as the authoritative source; mention the alternate in the reply.',
  },
  {
    issue: 128,
    slug: 'io-github-cappyeo-discord-mcp',
    update: {
      description: 'Caller-owned Discord operations for AI agents with 209 typed tools and verifiable guild builds.',
      tagline: 'Caller-owned Discord operations for AI agents with 209 typed tools and verifiable guild builds.',
      categories: ['communication'],
      has_authentication: true,
    },
    note: 'Registry now at v0.26.0 / 209 tools (reporter said 208, current DB tagline said 192, description said 193 — all three now superseded by the live registry number). tool_count / tools[] NOT touched here: extract-schemas.ts owns that and needs its own ingestion fix for this project\'s generated tool catalog — flagged separately, not a hand-edit.',
  },
  {
    issue: 108,
    slug: 'com-gtm-api-linkedin-mcp',
    update: {
      transport: ['stdio', 'streamable-http'],
      remote_url: 'https://mcp.gtm-api.com/mcp',
      has_authentication: true,
    },
    note: 'Registry v1.1.0 adds the npm package (already correct in DB) alongside the streamable-http remote, which sync-registry never wrote for this already-linked row (S65 / issue #108\'s own diagnosis, confirmed).',
  },
  {
    issue: 68,
    slug: 'datamcp',
    update: {
      has_authentication: true,
      remote_url: 'https://api.datamcp.app/api/mcp',
    },
    note: 'requires_api_key was already true; has_authentication (the flag ServerFAQ.tsx actually reads) was false, producing the false "does not require authentication" FAQ claim. remote_url lets InstallMatrix stop emitting the <see-readme> stdio stub for a hosted-only service. The edit-page sign-in bug this issue also reports is a separate code fix, not a data change.',
  },
]

async function main() {
  console.log(`=== Open-issues data correction${dryRun ? ' (DRY RUN)' : ''} ===\n`)

  const { data: probe, error: probeError } = await supabase.from('servers').select('remote_url').limit(1)
  const hasRemoteUrl = !probeError && probe !== null
  if (!hasRemoteUrl) {
    console.log('remote_url column not present yet — will skip that field until its migration lands.\n')
  }

  const auditPath = path.join(process.cwd(), 'data', 'open-issues-audit.jsonl')
  const stamp = new Date().toISOString()
  const auditLines: string[] = []

  let applied = 0
  let failed = 0

  for (const fix of FIXES) {
    const { data: row, error: fetchError } = await supabase
      .from('servers')
      .select('*')
      .eq('slug', fix.slug)
      .maybeSingle()

    if (fetchError || !row) {
      console.error(`[#${fix.issue}] ${fix.slug}: could not fetch row — ${fetchError?.message ?? 'not found'}`)
      failed++
      continue
    }

    const update = { ...fix.update }
    if (!hasRemoteUrl) delete update.remote_url

    const before: Record<string, unknown> = {}
    const changed: string[] = []
    for (const key of Object.keys(update)) {
      before[key] = (row as Record<string, unknown>)[key]
      if (JSON.stringify(before[key]) !== JSON.stringify(update[key])) changed.push(key)
    }

    console.log(`[#${fix.issue}] ${fix.slug}`)
    console.log(`  ${fix.note}`)
    if (changed.length === 0) {
      console.log('  no changes needed (already correct)\n')
      continue
    }
    for (const key of changed) {
      console.log(`  ${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(update[key])}`)
    }
    console.log()

    if (dryRun) continue

    auditLines.push(JSON.stringify({ at: stamp, issue: fix.issue, slug: fix.slug, id: row.id, previous: before }))

    const { error: updateError } = await supabase.from('servers').update(update).eq('id', row.id)
    if (updateError) {
      console.error(`  update failed: ${updateError.message}`)
      failed++
      continue
    }

    const { error: scoreError } = await supabase.rpc('compute_server_score', { p_server_id: row.id })
    if (scoreError) {
      console.error(`  score recompute failed: ${scoreError.message}`)
    }

    applied++
  }

  if (dryRun) {
    console.log('Dry run — nothing written.')
    return
  }

  if (auditLines.length > 0) {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true })
    fs.appendFileSync(auditPath, auditLines.join('\n') + '\n')
    console.log(`Previous values recorded in ${auditPath}`)
  }

  console.log(`\n${applied} row(s) updated, ${failed} failure(s).`)
  if (!hasRemoteUrl) {
    console.log('remote_url was skipped for every row — re-run this script after the #68 migration lands to fill it in.')
  }
  console.log('\nNote: these rows were written directly, not through app/api/admin/archive, so')
  console.log('the 7-day ISR cache for /s/<slug> is not auto-purged by this script. It will')
  console.log('refresh on the next production deploy (which purges the CDN), or immediately')
  console.log('via POST /api/revalidate with paths [\'/s/<slug>\', \'/s/<slug>/opengraph-image\']')
  console.log('if REVALIDATE_SECRET is set.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
