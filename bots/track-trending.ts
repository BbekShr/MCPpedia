/**
 * Trending Tracker — finds servers that gained the most stars recently.
 * Compares current stars to previous snapshot stored in github_stars.
 * Stores weekly star gain for homepage "Trending" section.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getRepo } from './lib/github'

const supabase = createAdminClient('bot-track-trending')

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function main() {
  const run = await BotRun.start('track-trending')
  try {
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

    if (!servers) {
      await run.fail('No servers returned')
      throw new Error('No servers returned')
    }

    console.log(`Checking ${servers.length} servers for star changes...\n`)
    run.addProcessed(servers.length)

    const trending: Array<{ slug: string; name: string; gain: number; current: number }> = []

    for (const server of servers) {
      const parsed = parseGitHubUrl(server.github_url)
      if (!parsed) continue

      const repo = await getRepo(parsed.owner, parsed.repo)
      if (!repo) continue

      const previousStars = server.github_stars || 0
      const currentStars = repo.stargazers_count
      const gain = currentStars - previousStars

      // Always update star count; also update trending tag
      const tags: string[] = (server.tags || []).filter((t: string) => !t.startsWith('trending:'))
      if (gain >= 10) tags.push(`trending:${gain}`)

      await supabase.from('servers').update({
        github_stars: currentStars,
        tags,
      }).eq('id', server.id)

      if (gain > 0) {
        trending.push({ slug: server.slug, name: server.slug, gain, current: currentStars })
        run.addUpdated()
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
    run.setSummary({ trending: trending.length })
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(e => { console.error(e); process.exit(1) })
