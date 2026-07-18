/**
 * Broken Link Checker — verifies GitHub URLs still exist, archives dead repos.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient, fetchAllRows } from './lib/supabase'
import { BotRun } from './lib/bot-run'

const supabase = createAdminClient('bot-check-broken-links')
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

// A single 404 from the GitHub API is NOT a reliable "repo is gone" signal:
// GitHub also 404s for renamed repos, briefly-private repos, and secondary
// rate-limiting — all transient. Since a not_found result permanently archives
// the listing (and blocks the owner from resubmitting), we must CONFIRM a 404
// by re-checking with backoff, and only report not_found if it persists across
// every attempt. Any non-404 error (403/429/5xx/network) returns 'error' and
// never archives. See #<broken-links-confirm-404>.
const NOT_FOUND_CONFIRM_ATTEMPTS = 3
const NOT_FOUND_RETRY_BASE_MS = 1500

async function checkRepo(owner: string, repo: string): Promise<'ok' | 'not_found' | 'error'> {
  const headers: Record<string, string> = { 'User-Agent': 'MCPpedia' }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  for (let attempt = 0; attempt < NOT_FOUND_CONFIRM_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
    } catch {
      return 'error' // network failure — never archive on this
    }

    if (res.status === 200) return 'ok'
    if (res.status !== 404) return 'error' // rate-limit / 5xx / etc — never archive

    // Got a 404. Confirm it isn't transient before trusting it.
    if (attempt < NOT_FOUND_CONFIRM_ATTEMPTS - 1) {
      await new Promise(r => setTimeout(r, NOT_FOUND_RETRY_BASE_MS * (attempt + 1)))
      continue
    }
    return 'not_found' // 404 persisted across every attempt
  }

  return 'error'
}

async function main() {
  const run = await BotRun.start('check-broken-links')
  try {
    console.log('=== MCPpedia Broken Link Checker ===')
    console.log(new Date().toISOString())

    const servers = await fetchAllRows<{ id: string; slug: string; github_url: string }>(
      supabase
        .from('servers')
        .select('id, slug, github_url')
        .not('github_url', 'is', null)
        .eq('is_archived', false)
    )

    console.log(`Checking ${servers.length} servers...\n`)
    run.addProcessed(servers.length)

    let ok = 0
    let broken = 0
    let errors = 0

    for (const server of servers) {
      const parsed = parseGitHubUrl(server.github_url)
      if (!parsed) continue

      const status = await checkRepo(parsed.owner, parsed.repo)

      if (status === 'ok') {
        ok++
      } else if (status === 'not_found') {
        console.log(`  ✗ BROKEN: ${server.slug} → ${server.github_url}`)
        await supabase.from('servers').update({
          is_archived: true,
          health_status: 'archived',
        }).eq('id', server.id)
        broken++
        run.addUpdated()
      } else {
        errors++
      }

      await new Promise(r => setTimeout(r, 100))
    }

    console.log(`\nDone. OK: ${ok}, Broken: ${broken}, Errors: ${errors}`)
    run.setSummary({ ok, broken, errors })
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(e => { console.error(e); process.exit(1) })
