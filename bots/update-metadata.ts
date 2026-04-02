/**
 * Metadata Updater — refreshes GitHub stars, downloads, health status.
 * Runs daily via GitHub Actions.
 */

import { createAdminClient } from './lib/supabase'
import { getRepo } from './lib/github'

const supabase = createAdminClient()

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
  console.log('=== MCPpedia Metadata Updater ===')
  console.log(new Date().toISOString())

  const { data: servers, error } = await supabase
    .from('servers')
    .select('id, slug, github_url, npm_package')
    .not('github_url', 'is', null)

  if (error || !servers) {
    console.error('Failed to fetch servers:', error?.message)
    return
  }

  console.log(`Updating metadata for ${servers.length} servers...`)

  let updated = 0
  let errors = 0

  for (const server of servers) {
    const parsed = parseGitHubUrl(server.github_url)
    if (!parsed) continue

    const repo = await getRepo(parsed.owner, parsed.repo)
    if (!repo) {
      console.warn(`  Could not fetch ${server.slug}`)
      errors++
      continue
    }

    const updates: Record<string, unknown> = {
      github_stars: repo.stargazers_count,
      github_last_commit: repo.pushed_at,
      github_open_issues: repo.open_issues_count,
      is_archived: repo.archived,
      health_status: computeHealth(repo.pushed_at, repo.archived),
      health_checked_at: new Date().toISOString(),
    }

    // Fetch npm downloads if applicable
    if (server.npm_package) {
      updates.npm_weekly_downloads = await fetchNpmDownloads(server.npm_package)
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
  }

  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}`)
}

main().catch(console.error)
