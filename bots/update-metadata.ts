/**
 * Metadata Updater — refreshes GitHub stars, downloads, health status.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getRepo } from './lib/github'
import { normalizeGithubUrl } from '../lib/normalize'

const supabase = createAdminClient('bot-update-metadata')

// Bots that archive a row because the upstream repo is archived or gone. Those
// archives are safe to undo once the repo is live again; every other archiving
// path (admin toggle, detect-duplicates merge) is not.
const AUTO_ARCHIVE_ACTORS = new Set(['bot-update-metadata', 'bot-check-broken-links'])

/**
 * Can we safely clear `is_archived` on a row whose GitHub repo is live again?
 *
 * Only when the archive is attributable to an automated "GitHub says archived /
 * gone" decision. Resurrecting a merged duplicate or overriding an admin's
 * manual archive is far worse than leaving a stale archive in place, so this
 * fails closed on every ambiguity — including its own query errors.
 */
async function canUnarchive(serverId: string, githubUrl: string, owner: string, repo: string): Promise<boolean> {
  // A live row on the same repo means this one was archived as a merged
  // duplicate — un-archiving would put the duplicate listing back in search.
  // The ilike is a cheap pre-filter (owner/repo come from a `[\w.-]+` regex, so
  // they carry no filter syntax); normalizeGithubUrl decides the actual match,
  // exactly as detect-duplicates groups them.
  const normalized = normalizeGithubUrl(githubUrl)
  const { data: siblings, error: siblingError } = await supabase
    .from('servers')
    .select('id, github_url')
    .eq('is_archived', false)
    .ilike('github_url', `%/${owner}/${repo}%`)
  if (siblingError) {
    console.warn(`  Un-archive check failed (siblings): ${siblingError.message}`)
    return false
  }
  if ((siblings || []).some(s => s.id !== serverId && normalizeGithubUrl(s.github_url) === normalized)) {
    return false
  }

  // Who set is_archived last? No audit row at all means it was archived at
  // INSERT time (the audit trigger only fires on update/delete) — i.e. ingested
  // straight from GitHub's own `archived` flag by discover/submit, which is the
  // exact case this heals (GitHub issues #22, #26).
  const { data: history, error: historyError } = await supabase
    .from('server_changes')
    .select('actor_id, actor_label, new_value')
    .eq('server_id', serverId)
    .eq('field_name', 'is_archived')
    .order('changed_at', { ascending: false })
    .limit(1)
  if (historyError) {
    console.warn(`  Un-archive check failed (audit): ${historyError.message}`)
    return false
  }

  const last = history?.[0]
  if (!last) return true
  if (last.new_value !== true) return false
  // actor_id is set only for logged-in (admin) writes; bots are service-role.
  return last.actor_id === null && AUTO_ARCHIVE_ACTORS.has(last.actor_label)
}

function computeHealth(pushedAt: string | null, archived: boolean): string {
  if (archived) return 'archived'
  if (!pushedAt) return 'unknown'
  const daysSince = (Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince < 30) return 'active'
  if (daysSince < 90) return 'maintained'
  if (daysSince < 365) return 'stale'
  return 'abandoned'
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function fetchNpmDownloads(packageName: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data.downloads || 0
  } catch {
    return 0
  }
}

async function main() {
  const run = await BotRun.start('update-metadata')
  try {
  console.log('=== MCPpedia Metadata Updater ===')
  console.log(new Date().toISOString())

  // Supabase returns max 1000 rows by default — paginate to get all
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servers: any[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('servers')
      .select('id, slug, github_url, npm_package, is_archived')
      .not('github_url', 'is', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (batchError) {
      await run.fail(`Failed to fetch servers: ${batchError.message}`)
      throw new Error(batchError.message)
    }
    if (!batch || batch.length === 0) break
    servers.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }

  if (servers.length === 0) {
    await run.fail('No servers found')
    throw new Error('No servers found')
  }

  console.log(`Updating metadata for ${servers.length} servers...`)

  let updated = 0
  let errors = 0
  let unarchived = 0

  for (const server of servers) {
    try {
    const parsed = parseGitHubUrl(server.github_url)
    if (!parsed) continue

    const repo = await getRepo(parsed.owner, parsed.repo)
    if (!repo) {
      console.warn(`  Could not fetch ${server.slug}`)
      errors++
      continue
    }

    // Fetch npm downloads if applicable
    let downloads = 0
    if (server.npm_package) {
      downloads = await fetchNpmDownloads(server.npm_package)
    }

    // Auto-archive: no commit in 2+ years AND 0 stars AND 0 downloads
    const daysSinceCommit = repo.pushed_at
      ? (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity
    const shouldAutoArchive = repo.archived || (
      daysSinceCommit > 730 && repo.stargazers_count === 0 && downloads === 0
    )

    // Archiving is unconditional; UN-archiving is not. We only clear the flag
    // when canUnarchive can prove the archive came from an automated "repo is
    // archived/gone" decision — otherwise we would clobber manual archives and
    // duplicate merges whenever the upstream repo looks healthy.
    const unarchive = server.is_archived && !shouldAutoArchive
      && await canUnarchive(server.id, server.github_url, parsed.owner, parsed.repo)

    const stillArchived = shouldAutoArchive || (server.is_archived && !unarchive)
    const updates: Record<string, unknown> = {
      github_stars: repo.stargazers_count,
      github_last_commit: repo.pushed_at,
      github_open_issues: repo.open_issues_count,
      health_status: computeHealth(repo.pushed_at, stillArchived),
      health_checked_at: new Date().toISOString(),
      npm_weekly_downloads: downloads,
    }
    if (shouldAutoArchive) updates.is_archived = true
    if (unarchive) {
      updates.is_archived = false
      unarchived++
      console.log(`  ↩ Un-archived ${server.slug} — upstream repo is live again`)
    }

    const { error: updateError } = await supabase
      .from('servers')
      .update(updates)
      .eq('id', server.id)

    if (updateError) {
      console.error(`  Error updating ${server.slug}: ${updateError.message}`)
      errors++
    } else {
      updated++
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`  Exception for ${server.slug}: ${String(err).slice(0, 100)}`)
      errors++
    }
  }

  run.addProcessed(servers.length)
  run.addUpdated(updated)
  run.setSummary({ updated, errors, unarchived })
  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}, Un-archived: ${unarchived}`)

  // A run that updated ZERO servers while erroring on some is NOT a success — it
  // means every GitHub fetch failed (e.g. an expired/invalid BOT_GITHUB_TOKEN or
  // a GitHub outage). Without this guard the job reports green while silently
  // freezing the whole site's stars/last-commit/health for days. Fail loudly so
  // the scheduled run turns red and someone rotates the token.
  if (updated === 0 && errors > 0) {
    throw new Error(
      `Every server failed to update (0 updated, ${errors} errors) — likely an expired/invalid BOT_GITHUB_TOKEN or a GitHub outage`
    )
  }

  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
