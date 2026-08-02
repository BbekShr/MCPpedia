/**
 * Duplicate Detector — finds servers pointing to the same GitHub repo.
 * Keeps the highest-quality row, re-parents user data onto it, archives the rest.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient, fetchAllRows } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { CURATED_FIELDS, pickCuratedBackfill } from '../lib/curated-merge'
import { buildDuplicateGroups } from '../lib/duplicate-groups'

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

/**
 * Moves every child row off the duplicate onto the keeper.
 *
 * Returns the tables that failed. The caller MUST NOT archive the duplicate
 * when this is non-empty: archiving hides the row while its reviews,
 * discussions and favorites still point at it, which is silent data loss. An
 * un-merged visible duplicate is merely cosmetic and the next run retries it.
 */
async function reparent(keeperId: string, dupeId: string): Promise<string[]> {
  const failures: string[] = []

  for (const table of REPARENT_TABLES) {
    const { error } = await supabase
      .from(table)
      .update({ server_id: keeperId })
      .eq('server_id', dupeId)
    if (error) {
      console.warn(`    reparent ${table}: ${error.message}`)
      failures.push(table)
    }
  }

  for (const table of REPARENT_TABLES_USER_UNIQUE) {
    // Find dupe rows whose user_id has no matching row on the keeper.
    // Move those, skip the conflicts (user already acted on the keeper).
    const { data: dupeRows, error: dupeError } = await supabase
      .from(table)
      .select('user_id')
      .eq('server_id', dupeId)
    if (dupeError) {
      console.warn(`    reparent ${table} (read dupe rows): ${dupeError.message}`)
      failures.push(table)
      continue
    }
    if (!dupeRows?.length) continue

    // A failed keeper lookup would leave keeperUsers empty and we would try to
    // move rows that DO conflict — bail instead of hitting the unique constraint.
    const { data: keeperRows, error: keeperError } = await supabase
      .from(table)
      .select('user_id')
      .eq('server_id', keeperId)
      .in('user_id', dupeRows.map(r => r.user_id))
    if (keeperError) {
      console.warn(`    reparent ${table} (read keeper rows): ${keeperError.message}`)
      failures.push(table)
      continue
    }

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
      if (error) {
        console.warn(`    reparent ${table}: ${error.message}`)
        failures.push(table)
      }
    }
  }

  return failures
}

/**
 * Copies the curated columns the duplicate holds and the keeper lacks.
 *
 * Runs BEFORE the archive write and, like reparent(), gates it: archiving a row
 * whose only-copy values failed to move is the data loss this is here to
 * prevent. Mutates `keeper` in place so a second duplicate in the same group
 * sees the values already claimed and does not re-fill them.
 */
async function backfillCurated(
  keeper: Record<string, unknown>,
  dupe: Record<string, unknown>
): Promise<{ filled: string[]; error: string | null }> {
  const updates = pickCuratedBackfill(keeper, dupe)
  const filled = Object.keys(updates)
  if (filled.length === 0) return { filled, error: null }

  const { error } = await supabase
    .from('servers')
    .update(updates)
    .eq('id', keeper.id as string)

  if (error) return { filled, error: error.message }

  Object.assign(keeper, updates)
  return { filled, error: null }
}

async function main() {
  const run = await BotRun.start('detect-duplicates')
  try {
    console.log('=== MCPpedia Duplicate Detector ===')
    console.log(new Date().toISOString())

    const servers = await fetchAllRows<{ id: string; slug: string; name: string; github_url: string; data_quality: number | null; score_total: number | null }>(
      supabase
        .from('servers')
        .select('id, slug, name, github_url, data_quality, score_total')
        .not('github_url', 'is', null)
        .eq('is_archived', false)
        .order('data_quality', { ascending: false, nullsFirst: false })
        // `data_quality` is a non-unique integer, so its tie groups are enormous and
        // Postgres may order them differently between offset pages — a row could be
        // returned twice and end up in its own duplicate group, archiving the keeper.
        // `id` is the unique tiebreak that makes the pagination deterministic.
        .order('id', { ascending: true })
    )
    run.addProcessed(servers.length)

    // Group by normalized GitHub URL, skipping known monorepos and any group
    // that holds fewer than two DISTINCT ids. The keeper is the group's first
    // element, which is only correct because of the ordering above.
    const groups = buildDuplicateGroups(servers)

    const duplicateGroups = groups.length
    let archived = 0
    const merged: { keeper: string; dupe: string; url: string }[] = []
    const reparentFailures: { dupe: string; tables: string[] }[] = []
    const backfilled: { keeper: string; dupe: string; fields: string[] }[] = []
    const backfillFailures: { dupe: string; reason: string }[] = []
    const curatedReadFailures: string[] = []

    for (const { url, keep, dupes } of groups) {
      const group = [keep, ...dupes]

      console.log(`  Duplicates for ${url}:`)
      console.log(`    KEEP: ${keep.slug} (quality: ${keep.data_quality}, score: ${keep.score_total})`)

      // Curated columns, fetched per group rather than for the whole table:
      // pulling the heavy JSONB (tools, install_configs) for every server on
      // the site to merge a handful of duplicates is not worth the payload.
      const { data: curatedRows, error: curatedError } = await supabase
        .from('servers')
        .select(`id, ${CURATED_FIELDS.join(', ')}`)
        .in('id', group.map(s => s.id))

      if (curatedError || !curatedRows) {
        // Archiving now would drop whatever only the duplicates hold, and the
        // archive is effectively irreversible — leave the whole group for the
        // next run instead.
        console.error(`    SKIP group: could not read curated columns (${curatedError?.message ?? 'no rows'})`)
        curatedReadFailures.push(url)
        continue
      }

      const curatedById = new Map(
        (curatedRows as unknown as Record<string, unknown>[]).map(r => [r.id as string, r])
      )

      for (const dupe of dupes) {
        // Never archive the keeper: reparent() would be a no-op and the archive write
        // would take the live listing down (gone from search, /servers, sitemaps).
        if (dupe.id === keep.id) {
          console.warn(`    SKIP: ${dupe.slug} is the keeper itself`)
          continue
        }
        console.log(`    MERGE: ${dupe.slug} (quality: ${dupe.data_quality}, score: ${dupe.score_total})`)

        // Move the columns before the child rows: a failure here must stop the
        // archive, same discipline as a reparent failure.
        const keeperCurated = curatedById.get(keep.id)
        const dupeCurated = curatedById.get(dupe.id)
        if (keeperCurated && dupeCurated) {
          const { filled, error: backfillError } = await backfillCurated(keeperCurated, dupeCurated)
          if (backfillError) {
            console.error(`    SKIP archive ${dupe.slug}: curated backfill failed (${backfillError}) — leaving the duplicate visible so the next run retries`)
            backfillFailures.push({ dupe: dupe.slug, reason: backfillError })
            continue
          }
          if (filled.length > 0) {
            console.log(`    BACKFILL onto ${keep.slug}: ${filled.join(', ')}`)
            backfilled.push({ keeper: keep.slug, dupe: dupe.slug, fields: filled })
          }
        }

        const failures = await reparent(keep.id, dupe.id)
        if (failures.length > 0) {
          console.error(`    SKIP archive ${dupe.slug}: reparent failed for ${failures.join(', ')} — leaving the duplicate visible so the next run retries`)
          reparentFailures.push({ dupe: dupe.slug, tables: failures })
          continue
        }
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
    run.setSummary({
      duplicateGroups, archived, merged, reparentFailures,
      backfilled, backfillFailures, curatedReadFailures,
    })
    console.log(`\nDone. Duplicate groups: ${duplicateGroups}, Archived: ${archived}, Backfilled: ${backfilled.length}, Reparent failures: ${reparentFailures.length}`)
    if (merged.length > 0) {
      console.log('\nAdd these redirects to next.config.ts:')
      for (const m of merged) {
        console.log(`  { source: '/s/${m.dupe}', destination: '/s/${m.keeper}', permanent: true },`)
      }
    }
    // A run that left duplicates un-merged is not a success. The cron is weekly,
    // so "the next run retries" is seven days away — long enough that even a
    // transient failure deserves to show up in the workflow-failure alerting
    // instead of a green run with a detail buried in the summary. run.fail()
    // persists the summary above and sets a non-zero exit code.
    const blocked = [
      ...reparentFailures.map(f => `${f.dupe} (reparent: ${f.tables.join(', ')})`),
      ...backfillFailures.map(f => `${f.dupe} (curated backfill: ${f.reason})`),
      ...curatedReadFailures.map(url => `${url} (curated read)`),
    ]
    if (blocked.length > 0) {
      await run.fail(
        `${blocked.length} duplicate(s) left un-archived: ${blocked.join('; ')}`
      )
      return
    }

    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
