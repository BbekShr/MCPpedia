/**
 * Discovery Bot — finds new MCP servers on GitHub, npm, and PyPI.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { searchRepos, type GitHubRepo } from './lib/github'

const supabase = createAdminClient()

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) // prevent excessively long slugs
}

function sanitize(str: string | null, maxLen = 500): string | null {
  if (!str) return null
  return str.slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars
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

async function getExistingGithubUrls(): Promise<Set<string>> {
  const { data } = await supabase
    .from('servers')
    .select('github_url')
    .not('github_url', 'is', null)

  return new Set((data || []).map(s => s.github_url?.toLowerCase()))
}

async function discoverFromGitHub() {
  console.log('Searching GitHub for MCP servers...')

  const queries = [
    'topic:mcp-server',
    '"mcp server" in:description',
    'topic:modelcontextprotocol',
    'mcp-server in:name',
  ]

  const allRepos = new Map<string, GitHubRepo>()

  for (const query of queries) {
    const repos = await searchRepos(query, 100)
    for (const repo of repos) {
      allRepos.set(repo.full_name, repo)
    }
    // Rate limit courtesy
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`Found ${allRepos.size} unique repos`)
  return Array.from(allRepos.values())
}

async function insertServer(repo: GitHubRepo, source: string) {
  const slug = slugify(repo.full_name.split('/')[1])

  // Check slug doesn't already exist
  const { data: existing } = await supabase
    .from('servers')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    console.log(`  Skipping ${slug} (slug exists)`)
    return false
  }

  const { error } = await supabase.from('servers').insert({
    slug,
    name: sanitize(repo.full_name.split('/')[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 200) || slug,
    tagline: sanitize(repo.description),
    github_url: repo.html_url,
    author_name: repo.owner.login,
    author_github: repo.owner.login,
    author_type: 'community',
    transport: ['stdio'],
    github_stars: repo.stargazers_count,
    github_last_commit: repo.pushed_at,
    github_open_issues: repo.open_issues_count,
    is_archived: repo.archived,
    license: repo.license?.spdx_id || null,
    homepage_url: repo.homepage || null,
    health_status: computeHealth(repo.pushed_at, repo.archived),
    health_checked_at: new Date().toISOString(),
    source,
    verified: false,
  })

  if (error) {
    console.error(`  Error inserting ${slug}: ${error.message}`)
    return false
  }

  console.log(`  Inserted: ${slug}`)
  return true
}

async function main() {
  const run = await BotRun.start('discover')
  try {
    console.log('=== MCPpedia Discovery Bot ===')
    console.log(new Date().toISOString())

    const existingUrls = await getExistingGithubUrls()
    console.log(`${existingUrls.size} servers already in database`)

    // GitHub discovery
    const repos = await discoverFromGitHub()
    const newRepos = repos.filter(r => !existingUrls.has(r.html_url.toLowerCase()))
    console.log(`${newRepos.length} new repos to add`)
    run.addProcessed(repos.length)

    let inserted = 0
    for (const repo of newRepos) {
      const success = await insertServer(repo, 'bot-github')
      if (success) { inserted++; run.addUpdated() }
      // Rate limit Supabase inserts
      await new Promise(r => setTimeout(r, 100))
    }

    run.setSummary({ repos_found: repos.length, new_repos: newRepos.length, inserted })
    console.log(`\nDone. Inserted ${inserted} new servers.`)
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
