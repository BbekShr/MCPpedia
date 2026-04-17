/**
 * Broken Link Checker — verifies GitHub URLs still exist, archives dead repos.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'

const supabase = createAdminClient('bot-check-broken-links')
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function checkRepo(owner: string, repo: string): Promise<'ok' | 'not_found' | 'error'> {
  try {
    const headers: Record<string, string> = { 'User-Agent': 'MCPpedia' }
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })

    if (res.status === 200) return 'ok'
    if (res.status === 404) return 'not_found'
    return 'error'
  } catch {
    return 'error'
  }
}

async function main() {
  console.log('=== MCPpedia Broken Link Checker ===')
  console.log(new Date().toISOString())

  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, github_url')
    .not('github_url', 'is', null)
    .eq('is_archived', false)

  if (!servers) { console.log('No servers'); return }

  console.log(`Checking ${servers.length} servers...\n`)

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
    } else {
      errors++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\nDone. OK: ${ok}, Broken: ${broken}, Errors: ${errors}`)
}

main().catch(console.error)
