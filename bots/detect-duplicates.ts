/**
 * Duplicate Detector — finds servers pointing to the same GitHub repo.
 * Keeps the highest-quality row, re-parents user data onto it, archives the rest.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { normalizeGithubUrl } from '../lib/normalize'

const supabase = createAdminClient('bot-detect-duplicates')

// Tables with a server_id FK that hold user-authored or historical data.
// Kept in lock-step with the schema in supabase/migrations/.
const REPARENT_TABLES = [
  'discussions',
  'edits',
  'changelogs',
  'health_checks',
  'security_advisories',
] as const

// Tables with a (server_id, user_id) unique constraint — re-parent only when
// the user hasn't already acted on the keeper, otherwise the constraint fires.
const REPARENT_TABLES_USER_UNIQUE = [
  'reviews',
  'publisher_claims',
  'community_verifications',
  'favorites',
] as const

async function reparent(keeperId: string, dupeId: string): Promise<void> {
  for (const table of REPARENT_TABLES) {
    const { error } = await supabase
      .from(table)
      .update({ server_id: keeperId })
      .eq('server_id', dupeId)
    if (error) console.warn(`    reparent ${table}: ${error.message}`)
  }

  for (const table of REPARENT_TABLES_USER_UNIQUE) {
    // Find dupe rows whose user_id has no matching row on the keeper.
    // Move those, skip the conflicts (user already acted on the keeper).
    const { data: dupeRows } = await supabase
      .from(table)
      .select('user_id')
      .eq('server_id', dupeId)
    if (!dupeRows?.length) continue

    const { data: keeperRows } = await supabase
      .from(table)
      .select('user_id')
      .eq('server_id', keeperId)
      .in('user_id', dupeRows.map(r => r.user_id))

    const keeperUsers = new Set((keeperRows || []).map(r => r.user_id))
    const movableUserIds = dupeRows
      .map(r => r.user_id)
      .filter(uid => !keeperUsers.has(uid))

    if (movableUserIds.length > 0) {
      const { error } = await supabase
        .from(table)
        .update({ server_id: keeperId })
        .eq('server_id', dupeId)
        .in('user_id', movableUserIds)
      if (error) console.warn(`    reparent ${table}: ${error.message}`)
    }
  }
}

async function main() {
  const run = await BotRun.start('detect-duplicates')
  try {
    console.log('=== MCPpedia Duplicate Detector ===')
    console.log(new Date().toISOString())

    const { data: servers } = await supabase
      .from('servers')
      .select('id, slug, name, github_url, data_quality, score_total')
      .not('github_url', 'is', null)
      .eq('is_archived', false)
      .order('data_quality', { ascending: false, nullsFirst: false })

    if (!servers) { console.log('No servers'); await run.finish(); return }
    run.addProcessed(servers.length)

    // Known monorepos that contain multiple distinct MCP servers — skip these
    const MONOREPO_URLS = new Set([
      'https://github.com/modelcontextprotocol/servers',
      'https://github.com/mintmcp/servers',
      'https://github.com/ryudi84/sovereign-mcp-servers',
      'https://github.com/dave-london/pare',
      'https://github.com/mansurjisan/ocean-mcp',
      'https://github.com/iowarp/clio-kit',
      'https://github.com/martc03/gov-mcp-servers',
      'https://github.com/la-rebelion/hapimcp',
      'https://github.com/waystation-ai/mcp',
    ].map(u => normalizeGithubUrl(u)).filter((u): u is string => !!u))

    // Group by normalized GitHub URL
    const byUrl = new Map<string, typeof servers>()

    for (const server of servers) {
      const url = normalizeGithubUrl(server.github_url)
      if (!url) continue
      if (MONOREPO_URLS.has(url)) continue
      if (!byUrl.has(url)) byUrl.set(url, [])
      byUrl.get(url)!.push(server)
    }

    let duplicateGroups = 0
    let archived = 0
    const merged: { keeper: string; dupe: string; url: string }[] = []

    for (const [url, group] of byUrl) {
      if (group.length <= 1) continue

      duplicateGroups++
      const keep = group[0]
      const dupes = group.slice(1)

      console.log(`  Duplicates for ${url}:`)
      console.log(`    KEEP: ${keep.slug} (quality: ${keep.data_quality}, score: ${keep.score_total})`)

      for (const dupe of dupes) {
        console.log(`    MERGE: ${dupe.slug} (quality: ${dupe.data_quality}, score: ${dupe.score_total})`)
        await reparent(keep.id, dupe.id)
        const { error } = await supabase
          .from('servers')
          .update({ is_archived: true })
          .eq('id', dupe.id)
        if (error) {
          console.error(`    archive ${dupe.slug}: ${error.message}`)
          continue
        }
        archived++
        merged.push({ keeper: keep.slug, dupe: dupe.slug, url })
      }
    }

    run.addUpdated(archived)
    run.setSummary({ duplicateGroups, archived, merged })
    console.log(`\nDone. Duplicate groups: ${duplicateGroups}, Archived: ${archived}`)
    if (merged.length > 0) {
      console.log('\nAdd these redirects to next.config.ts:')
      for (const m of merged) {
        console.log(`  { source: '/s/${m.dupe}', destination: '/s/${m.keeper}', permanent: true },`)
      }
    }
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
