/**
 * Discovery Bot — finds new MCP servers on GitHub, npm, and PyPI.
 * Runs daily via GitHub Actions.
 *
 * Sources:
 * 1. GitHub Search — multiple queries with pagination, prioritizing starred repos
 * 2. npm Registry — searches for packages with "mcp" in the name
 * 3. PyPI — searches for packages with "mcp" in the name
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { searchRepos, type GitHubRepo } from './lib/github'
import { categorize } from './lib/categorize'

const supabase = createAdminClient()

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@[\w-]+\//, '') // strip npm scope
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

function sanitize(str: string | null, maxLen = 500): string | null {
  if (!str) return null
  return str.slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
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
  const urls: string[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('servers')
      .select('github_url')
      .not('github_url', 'is', null)
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    urls.push(...data.map(s => s.github_url?.toLowerCase()))
    if (data.length < PAGE) break
    from += PAGE
  }
  return new Set(urls)
}

async function getExistingSlugs(): Promise<Set<string>> {
  const slugs: string[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('servers')
      .select('slug')
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    slugs.push(...data.map(s => s.slug))
    if (data.length < PAGE) break
    from += PAGE
  }
  return new Set(slugs)
}

async function getExistingNpmPackages(): Promise<Set<string>> {
  const pkgs: string[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('servers')
      .select('npm_package')
      .not('npm_package', 'is', null)
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    pkgs.push(...data.map(s => s.npm_package))
    if (data.length < PAGE) break
    from += PAGE
  }
  return new Set(pkgs)
}

async function getExistingPipPackages(): Promise<Set<string>> {
  const pkgs: string[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('servers')
      .select('pip_package')
      .not('pip_package', 'is', null)
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    pkgs.push(...data.map(s => s.pip_package))
    if (data.length < PAGE) break
    from += PAGE
  }
  return new Set(pkgs)
}

// ---- GitHub Discovery ----

async function discoverFromGitHub(): Promise<GitHubRepo[]> {
  console.log('Searching GitHub...')

  // Prioritize high-quality repos first, then cast a wider net
  const queries = [
    // High-quality: starred repos
    'topic:mcp-server stars:>50',
    'topic:mcp-server stars:10..50',
    'topic:modelcontextprotocol stars:>10',
    '"mcp server" in:description stars:>20',
    'mcp-server in:name stars:>10',

    // Broad discovery
    'topic:mcp-server',
    'topic:modelcontextprotocol',
    '"mcp server" in:description',
    'mcp-server in:name',
    '"model context protocol" in:description',

    // Language-specific (catches servers that don't use the topic)
    '"@modelcontextprotocol/sdk" in:file language:typescript',
    '"mcp.server" in:file language:python',
    'mcp server tool language:typescript stars:>5',
    'mcp server tool language:python stars:>5',

    // Ecosystem-specific
    '"mcpServers" in:readme stars:>5',
    '"MCP" "server" "tool" in:description stars:>20',
  ]

  const allRepos = new Map<string, GitHubRepo>()

  for (const query of queries) {
    try {
      const repos = await searchRepos(query, 100)
      for (const repo of repos) {
        allRepos.set(repo.full_name.toLowerCase(), repo)
      }
      console.log(`  "${query}" → ${repos.length} results (total unique: ${allRepos.size})`)
    } catch (err) {
      console.error(`  Error searching "${query}": ${err}`)
    }
    await new Promise(r => setTimeout(r, 2000)) // GitHub search rate limit: 30 req/min
  }

  console.log(`Found ${allRepos.size} unique repos from GitHub`)
  return Array.from(allRepos.values())
}

// ---- npm Discovery ----

interface NpmSearchResult {
  name: string
  description?: string
  links?: { repository?: string; npm?: string; homepage?: string }
  publisher?: { username?: string }
}

async function discoverFromNpm(): Promise<NpmSearchResult[]> {
  console.log('Searching npm...')
  const results: NpmSearchResult[] = []

  const queries = ['mcp-server', 'mcp server', 'modelcontextprotocol', '@modelcontextprotocol']

  for (const q of queries) {
    try {
      // npm search API returns up to 250 results
      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=250`,
      )
      if (!res.ok) { console.error(`  npm search "${q}" failed: ${res.status}`); continue }
      const data = await res.json()
      const objects = data.objects || []

      for (const obj of objects) {
        const pkg = obj.package
        if (pkg?.name) {
          results.push({
            name: pkg.name,
            description: pkg.description,
            links: pkg.links,
            publisher: pkg.publisher,
          })
        }
      }
      console.log(`  "${q}" → ${objects.length} results`)
    } catch (err) {
      console.error(`  Error searching npm for "${q}": ${err}`)
    }
    await new Promise(r => setTimeout(r, 500))
  }

  // Deduplicate by name
  const seen = new Set<string>()
  const unique = results.filter(r => {
    if (seen.has(r.name)) return false
    seen.add(r.name)
    return true
  })

  console.log(`Found ${unique.length} unique npm packages`)
  return unique
}

// ---- PyPI Discovery ----

interface PyPIResult {
  name: string
  version: string
  summary?: string
}

async function discoverFromPyPI(): Promise<PyPIResult[]> {
  console.log('Searching PyPI...')
  const results: PyPIResult[] = []

  // PyPI's simple search API is limited — use the JSON API with keyword search
  const queries = ['mcp-server', 'mcp server', 'modelcontextprotocol']

  for (const q of queries) {
    try {
      // PyPI doesn't have a great search API, but we can use the warehouse search endpoint
      const res = await fetch(
        `https://pypi.org/search/?q=${encodeURIComponent(q)}&o=`,
        { headers: { Accept: 'application/json' } }
      )

      if (!res.ok) {
        // Fallback: parse HTML or skip
        console.warn(`  PyPI search "${q}" returned ${res.status} — trying XML API`)
        // Try the XML-RPC API instead
        const xmlRes = await fetch('https://pypi.org/pypi', {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml' },
          body: `<?xml version="1.0"?><methodCall><methodName>search</methodName><params><param><value><struct><member><name>name</name><value><string>${q}</string></value></member></struct></value></param></params></methodCall>`,
        })
        if (!xmlRes.ok) {
          console.warn(`  PyPI XML-RPC also failed: ${xmlRes.status}`)
          continue
        }
        const xmlText = await xmlRes.text()
        // Parse simple results from XML
        const nameMatches = xmlText.matchAll(/<name>name<\/name>\s*<value><string>([^<]+)<\/string>/g)
        const summaryMatches = xmlText.matchAll(/<name>summary<\/name>\s*<value><string>([^<]+)<\/string>/g)
        const names = Array.from(nameMatches, m => m[1])
        const summaries = Array.from(summaryMatches, m => m[1])
        for (let i = 0; i < names.length; i++) {
          results.push({ name: names[i], version: '', summary: summaries[i] || '' })
        }
        console.log(`  "${q}" (XML-RPC) → ${names.length} results`)
        continue
      }

      // If JSON works, parse it
      const data = await res.json()
      if (Array.isArray(data)) {
        for (const pkg of data) {
          results.push({ name: pkg.name, version: pkg.version || '', summary: pkg.summary || '' })
        }
      }
    } catch (err) {
      console.error(`  Error searching PyPI for "${q}": ${err}`)
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  // Deduplicate
  const seen = new Set<string>()
  const unique = results.filter(r => {
    if (seen.has(r.name)) return false
    seen.add(r.name)
    return true
  })

  console.log(`Found ${unique.length} unique PyPI packages`)
  return unique
}

// ---- Insertion helpers ----

async function insertFromGitHub(repo: GitHubRepo, source: string, existingSlugs: Set<string>) {
  const slug = slugify(repo.full_name.split('/')[1])

  if (existingSlugs.has(slug)) return false

  const categories = categorize(
    repo.full_name.split('/')[1],
    repo.description,
  )

  const { error } = await supabase.from('servers').insert({
    slug,
    name: sanitize(repo.full_name.split('/')[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 200) || slug,
    tagline: sanitize(repo.description),
    github_url: repo.html_url,
    author_name: repo.owner.login,
    author_github: repo.owner.login,
    author_type: 'community',
    transport: ['stdio'],
    categories,
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
    if (!error.message.includes('duplicate')) {
      console.error(`  Error inserting ${slug}: ${error.message}`)
    }
    return false
  }

  existingSlugs.add(slug)
  console.log(`  + ${slug} (${repo.stargazers_count}★)`)
  return true
}

async function insertFromNpm(
  pkg: NpmSearchResult,
  existingSlugs: Set<string>,
  existingNpmPkgs: Set<string>
) {
  if (existingNpmPkgs.has(pkg.name)) return false

  const slug = slugify(pkg.name)
  if (existingSlugs.has(slug)) return false

  const githubUrl = pkg.links?.repository || null
  const categories = categorize(pkg.name, pkg.description)

  const { error } = await supabase.from('servers').insert({
    slug,
    name: sanitize(pkg.name.replace(/^@[\w-]+\//, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 200) || slug,
    tagline: sanitize(pkg.description || null),
    github_url: githubUrl,
    npm_package: pkg.name,
    author_name: pkg.publisher?.username || null,
    author_github: pkg.publisher?.username || null,
    author_type: 'community',
    transport: ['stdio'],
    categories,
    health_status: 'unknown',
    source: 'bot-npm',
    verified: false,
  })

  if (error) {
    if (!error.message.includes('duplicate')) {
      console.error(`  Error inserting npm/${slug}: ${error.message}`)
    }
    return false
  }

  existingSlugs.add(slug)
  existingNpmPkgs.add(pkg.name)
  console.log(`  + npm: ${pkg.name}`)
  return true
}

async function insertFromPyPI(
  pkg: PyPIResult,
  existingSlugs: Set<string>,
  existingPipPkgs: Set<string>
) {
  if (existingPipPkgs.has(pkg.name)) return false

  const slug = slugify(pkg.name)
  if (existingSlugs.has(slug)) return false

  const categories = categorize(pkg.name, pkg.summary)

  const { error } = await supabase.from('servers').insert({
    slug,
    name: sanitize(pkg.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 200) || slug,
    tagline: sanitize(pkg.summary || null),
    pip_package: pkg.name,
    author_type: 'community',
    transport: ['stdio'],
    categories,
    health_status: 'unknown',
    source: 'bot-pypi',
    verified: false,
  })

  if (error) {
    if (!error.message.includes('duplicate')) {
      console.error(`  Error inserting pypi/${slug}: ${error.message}`)
    }
    return false
  }

  existingSlugs.add(slug)
  existingPipPkgs.add(pkg.name)
  console.log(`  + pypi: ${pkg.name}`)
  return true
}

// ---- Main ----

async function main() {
  const run = await BotRun.start('discover')
  try {
    console.log('=== MCPpedia Discovery Bot ===')
    console.log(new Date().toISOString())

    // Load existing data
    const [existingUrls, existingSlugs, existingNpmPkgs, existingPipPkgs] = await Promise.all([
      getExistingGithubUrls(),
      getExistingSlugs(),
      getExistingNpmPackages(),
      getExistingPipPackages(),
    ])
    console.log(`Existing: ${existingUrls.size} GitHub URLs, ${existingSlugs.size} slugs, ${existingNpmPkgs.size} npm, ${existingPipPkgs.size} pip\n`)

    let totalInserted = 0

    // 1. GitHub discovery
    const repos = await discoverFromGitHub()
    const newRepos = repos.filter(r => !existingUrls.has(r.html_url.toLowerCase()))
    console.log(`\n${newRepos.length} new GitHub repos to add`)
    run.addProcessed(repos.length)

    // Sort by stars descending — insert best repos first
    newRepos.sort((a, b) => b.stargazers_count - a.stargazers_count)

    for (const repo of newRepos) {
      const success = await insertFromGitHub(repo, 'bot-github', existingSlugs)
      if (success) { totalInserted++; run.addUpdated() }
      await new Promise(r => setTimeout(r, 50))
    }

    // 2. npm discovery
    const npmPkgs = await discoverFromNpm()
    const newNpmPkgs = npmPkgs.filter(p => !existingNpmPkgs.has(p.name))
    console.log(`\n${newNpmPkgs.length} new npm packages to add`)

    for (const pkg of newNpmPkgs) {
      const success = await insertFromNpm(pkg, existingSlugs, existingNpmPkgs)
      if (success) { totalInserted++; run.addUpdated() }
      await new Promise(r => setTimeout(r, 50))
    }

    // 3. PyPI discovery
    const pypiPkgs = await discoverFromPyPI()
    const newPypiPkgs = pypiPkgs.filter(p => !existingPipPkgs.has(p.name))
    console.log(`\n${newPypiPkgs.length} new PyPI packages to add`)

    for (const pkg of newPypiPkgs) {
      const success = await insertFromPyPI(pkg, existingSlugs, existingPipPkgs)
      if (success) { totalInserted++; run.addUpdated() }
      await new Promise(r => setTimeout(r, 50))
    }

    run.setSummary({
      github_repos: repos.length,
      new_github: newRepos.length,
      npm_packages: npmPkgs.length,
      new_npm: newNpmPkgs.length,
      pypi_packages: pypiPkgs.length,
      new_pypi: newPypiPkgs.length,
      total_inserted: totalInserted,
    })
    console.log(`\nDone. Inserted ${totalInserted} new servers total.`)
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
