/**
 * Metadata Updater — refreshes GitHub stars, downloads, health status.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getRepo } from './lib/github'

const supabase = createAdminClient('bot-update-metadata')

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
      console.error('Failed to fetch servers:', batchError.message)
      return
    }
    if (!batch || batch.length === 0) break
    servers.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }

  if (servers.length === 0) {
    console.error('No servers found')
    return
  }

  console.log(`Updating metadata for ${servers.length} servers...`)

  let updated = 0
  let errors = 0

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

    // Only archive forward — never unarchive here. Otherwise we clobber
    // manual archives (e.g. duplicate merges) whenever the upstream GitHub
    // repo looks healthy. Admins can unarchive via /admin if needed.
    const updates: Record<string, unknown> = {
      github_stars: repo.stargazers_count,
      github_last_commit: repo.pushed_at,
      github_open_issues: repo.open_issues_count,
      health_status: computeHealth(repo.pushed_at, server.is_archived || shouldAutoArchive),
      health_checked_at: new Date().toISOString(),
      npm_weekly_downloads: downloads,
    }
    if (shouldAutoArchive) updates.is_archived = true

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
  run.setSummary({ updated, errors })
  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`)
  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
