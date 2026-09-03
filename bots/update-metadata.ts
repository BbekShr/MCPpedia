/**
 * Metadata Updater — refreshes GitHub stars, downloads, health status.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
import {
  decideStarAttribution,
  fetchNpmRepositoryDirectory,
  normalizeRepoUrl,
} from './lib/star-attribution'
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
      .select('id, slug, github_url, npm_package, is_archived, license')
      .not('github_url', 'is', null)
      // Stalest-first, not id-first: this loop does not reliably finish in one
      // run (GitHub-hosted runners hard-cap a job at 6h, and the catalog has
      // grown past what a 6h sequential sweep — one GitHub + one npm fetch per
      // server, rate-limited — can cover; verified against prod: 27k/31k
      // servers with a github_url had health_checked_at = NULL because every
      // run restarted from the same id and never got past the first ~13k).
      // Ordering by staleness means a run that gets killed partway still made
      // real progress: tomorrow's run picks up the servers today's run didn't
      // reach, instead of re-doing the same head of the table forever.
      // `id` breaks ties (many rows share health_checked_at = NULL) and keeps
      // paging deterministic — without a unique sort key, rows shifting
      // between page fetches silently drop servers from the day's refresh.
      .order('health_checked_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
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

  // Census of how many servers resolve to each repo. A repo claimed by several
  // servers cannot have its star count assigned to any one of them — see
  // lib/star-attribution.ts. Built from the batch already in memory, so this
  // costs no extra queries.
  //
  // Archived rows are excluded: a duplicate merge (bots/detect-duplicates.ts)
  // archives the losing row but never clears its github_url, so an active
  // server's permanent post-merge state is sharing a URL with its own archived
  // duplicate. Counting that as a second claimant would zero the active row's
  // real stars every single day. Verified against prod: 696 active servers
  // with github_stars > 0 share a github_url with >=1 archived row (largest:
  // chrome-devtools-mcp at 50,197 stars) — this is not a hypothetical case.
  const serversPerRepo = new Map<string, number>()
  for (const s of servers) {
    if (s.is_archived) continue
    const key = normalizeRepoUrl(s.github_url)
    if (key) serversPerRepo.set(key, (serversPerRepo.get(key) || 0) + 1)
  }
  const sharedRepos = [...serversPerRepo.values()].filter(n => n > 1).length
  console.log(`  ${sharedRepos} repo(s) back more than one server — their stars will not be attributed`)

  let starsWithheld = 0

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
    // Only credit the repo's stars when this server IS the repo. An npm package
    // living in a monorepo subdirectory, or a repo backing several catalog
    // entries, inherits a following it did not earn — and that following is
    // worth up to 5 maintenance points and a slot on the trending list.
    const npmDirectory = server.npm_package
      ? await fetchNpmRepositoryDirectory(server.npm_package)
      : null
    const attribution = decideStarAttribution({
      npmDirectory,
      serversSharingRepo: serversPerRepo.get(normalizeRepoUrl(server.github_url) || '') ?? 1,
    })
    if (!attribution.attribute && repo.stargazers_count > 0) {
      starsWithheld++
      console.log(`  ${server.slug}: withholding ${repo.stargazers_count} stars (${attribution.reason})`)
    }

    const updates: Record<string, unknown> = {
      github_stars: attribution.attribute ? repo.stargazers_count : 0,
      github_last_commit: repo.pushed_at,
      github_open_issues: repo.open_issues_count,
      health_status: computeHealth(repo.pushed_at, server.is_archived || shouldAutoArchive),
      health_checked_at: new Date().toISOString(),
      npm_weekly_downloads: downloads,
    }
    if (shouldAutoArchive) updates.is_archived = true

    // Backfill the license. Only discover.ts ever sets it, so servers that
    // arrived through sync-registry (the registry payload has no license
    // field) keep license = null forever and lose 3 security points for a
    // repo that is in fact licensed. Fill a NULL only — never overwrite a
    // value someone curated, and skip NOASSERTION since scoring treats it
    // as no license anyway.
    if (!server.license && repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION') {
      updates.license = repo.license.spdx_id
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
  run.setSummary({ updated, errors, starsWithheld })
  console.log(`\nDone. Updated: ${updated}, Errors: ${errors}, Stars withheld: ${starsWithheld}`)

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
