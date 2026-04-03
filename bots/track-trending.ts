/**
 * Trending Tracker — finds servers that gained the most stars recently.
 * Compares current stars to previous snapshot stored in github_stars.
 * Stores weekly star gain for homepage "Trending" section.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { getRepo } from './lib/github'

const supabase = createAdminClient()

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function main() {
  console.log('=== MCPpedia Trending Tracker ===')
  console.log(new Date().toISOString())

  // Get servers with GitHub URLs, sorted by current stars
  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, github_url, github_stars, tags')
    .not('github_url', 'is', null)
    .eq('is_archived', false)
    .gt('github_stars', 0)
    .order('github_stars', { ascending: false })
    .limit(500) // Check top 500 by stars

  if (!servers) { console.log('No servers'); return }

  console.log(`Checking ${servers.length} servers for star changes...\n`)

  const trending: Array<{ slug: string; name: string; gain: number; current: number }> = []

  for (const server of servers) {
    const parsed = parseGitHubUrl(server.github_url)
    if (!parsed) continue

    const repo = await getRepo(parsed.owner, parsed.repo)
    if (!repo) continue

    const previousStars = server.github_stars || 0
    const currentStars = repo.stargazers_count
    const gain = currentStars - previousStars

    if (gain > 0) {
      trending.push({ slug: server.slug, name: server.slug, gain, current: currentStars })

      // Store the gain in tags for now (we'll add a proper field later)
      const tags = server.tags || []
      const existingTrend = tags.findIndex((t: string) => t.startsWith('trending:'))
      if (existingTrend >= 0) tags.splice(existingTrend, 1)
      if (gain >= 10) tags.push(`trending:${gain}`)

      await supabase.from('servers').update({
        github_stars: currentStars,
        tags,
      }).eq('id', server.id)
    }

    await new Promise(r => setTimeout(r, 150))
  }

  // Sort by gain
  trending.sort((a, b) => b.gain - a.gain)

  console.log('Top trending:')
  trending.slice(0, 20).forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.slug}: +${t.gain} stars (now ${t.current})`)
  })

  console.log(`\nDone. ${trending.length} servers gained stars.`)
}

main().catch(console.error)
