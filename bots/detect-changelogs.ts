/**
 * Changelog Detector — detects new versions from GitHub releases.
 * Runs daily via GitHub Actions.
 */

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getReleases } from './lib/github'

const supabase = createAdminClient()

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function main() {
  const run = await BotRun.start('detect-changelogs')
  try {
  console.log('=== MCPpedia Changelog Detector ===')
  console.log(new Date().toISOString())

  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, github_url')
    .not('github_url', 'is', null)

  if (!servers || servers.length === 0) {
    console.log('No servers to check.')
    await run.finish()
    return
  }

  console.log(`Checking changelogs for ${servers.length} servers...`)

  let newVersions = 0

  for (const server of servers) {
    const parsed = parseGitHubUrl(server.github_url)
    if (!parsed) continue

    const releases = await getReleases(parsed.owner, parsed.repo)
    if (releases.length === 0) continue

    // Get existing changelog versions
    const { data: existingChangelogs } = await supabase
      .from('changelogs')
      .select('version')
      .eq('server_id', server.id)

    const existingVersions = new Set(
      (existingChangelogs || []).map(c => c.version)
    )

    for (const release of releases) {
      const version = release.tag_name.replace(/^v/, '')

      if (existingVersions.has(version)) continue

      const { error } = await supabase.from('changelogs').insert({
        server_id: server.id,
        version,
        changes_summary: release.name || release.body?.slice(0, 200) || null,
        github_release_url: release.html_url,
        detected_at: release.published_at || new Date().toISOString(),
      })

      if (!error) {
        console.log(`  ${server.slug}: new version ${version}`)
        newVersions++
      }
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  run.addProcessed(servers.length)
  run.addUpdated(newVersions)
  run.setSummary({ new_versions: newVersions })
  console.log(`\nDone. Detected ${newVersions} new versions.`)
  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
