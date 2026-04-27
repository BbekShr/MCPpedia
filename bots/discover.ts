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
import { searchRepos, searchReposPaginated, type GitHubRepo } from './lib/github'
import { categorize, inferCompatibleClients, inferPricing } from './lib/categorize'

const supabase = createAdminClient('bot-discover')

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

  // Paginated queries — these have >100 results, so we fetch multiple pages
  const paginatedQueries = [
    'topic:mcp-server',
    'topic:modelcontextprotocol',
    '"mcp server" in:description',
    'mcp-server in:name',
    '"model context protocol" in:description',
    '"@modelcontextprotocol/sdk" in:file language:typescript',
    '"mcp.server" in:file language:python',
    'mcp-server in:name language:typescript',
    'mcp-server in:name language:python',
    'mcp-server in:name language:go',
    'mcp-server in:name language:rust',
    'mcp-server in:name language:java',
    'mcp-server in:name language:csharp',
    'mcp in:name server in:name',
    '"mcp" "tools" "server" in:description',
  ]

  // Single-page queries — more targeted, unlikely to have >100 results
  const singleQueries = [
    // High-quality
    'topic:mcp-server stars:>50',
    'topic:mcp-server stars:10..50',
    'topic:modelcontextprotocol stars:>10',
    '"mcp server" in:description stars:>20',

    // SDK-specific patterns
    '"from mcp.server" in:file language:python',
    '"McpServer" in:file language:typescript',
    '"StdioServerTransport" in:file language:typescript',
    '"FastMCP" in:file language:python',

    // Ecosystem-specific
    '"mcpServers" in:readme',
    '"MCP" "server" "tool" in:description stars:>5',

    // Framework-specific
    'mcp server language:kotlin',
    'mcp server language:ruby',
    'mcp server language:swift',
    'mcp server language:php',

    // Date-range: recently created (catch brand new servers)
    'mcp-server in:name created:>2025-01-01',
    'topic:mcp-server created:>2025-01-01',
    '"mcp server" in:description created:>2025-06-01',
    '"mcp server" in:description created:>2026-01-01',

    // Naming patterns
    'mcp- in:name "server" in:description',
    '-mcp in:name "server" in:description',
    'mcp_server in:name',
  ]

  const allRepos = new Map<string, GitHubRepo>()

  // Paginated queries first (up to 1000 results each)
  for (const query of paginatedQueries) {
    try {
      const repos = await searchReposPaginated(query, 10, 100)
      for (const repo of repos) {
        allRepos.set(repo.full_name.toLowerCase(), repo)
      }
      console.log(`  [paginated] "${query}" → ${repos.length} results (total unique: ${allRepos.size})`)
    } catch (err) {
      console.error(`  Error searching "${query}": ${err}`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  // Single-page queries
  for (const query of singleQueries) {
    try {
      const repos = await searchRepos(query, 100)
      for (const repo of repos) {
        allRepos.set(repo.full_name.toLowerCase(), repo)
      }
      console.log(`  "${query}" → ${repos.length} results (total unique: ${allRepos.size})`)
    } catch (err) {
      console.error(`  Error searching "${query}": ${err}`)
    }
    await new Promise(r => setTimeout(r, 2000))
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

  const queries = [
    'mcp-server', 'mcp server', 'modelcontextprotocol',
    '@modelcontextprotocol', 'mcp tool server',
    'mcp-tool', 'fastmcp', 'mcp plugin',
    'model context protocol server',
  ]

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

  // PyPI doesn't have a search API that returns JSON.
  // Strategy: check known MCP-related package name prefixes via the JSON API directly.
  const prefixes = [
    'mcp-server-', 'mcp_server_', 'mcp-', 'fastmcp-',
    'modelcontextprotocol-', 'pymcp-',
  ]

  // Also check the Simple API index for packages matching our prefixes
  try {
    console.log('  Fetching PyPI simple index...')
    const res = await fetch('https://pypi.org/simple/', {
      headers: { Accept: 'application/vnd.pypi.simple.v1+json' },
    })
    if (res.ok) {
      const data = await res.json()
      const projects: Array<{ name: string }> = data.projects || []
      console.log(`  PyPI index has ${projects.length} total packages`)

      const mcpPackages = projects.filter(p => {
        const lower = p.name.toLowerCase()
        return prefixes.some(prefix => lower.startsWith(prefix)) ||
          (lower.includes('mcp') && (lower.includes('server') || lower.includes('tool')))
      })

      console.log(`  Found ${mcpPackages.length} MCP-related packages in index`)

      // Fetch metadata for each to get summary
      for (const pkg of mcpPackages) {
        try {
          const metaRes = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`)
          if (!metaRes.ok) continue
          const meta = await metaRes.json()
          results.push({
            name: pkg.name,
            version: meta.info?.version || '',
            summary: meta.info?.summary || '',
          })
        } catch {
          // Skip individual failures
        }
        // Be nice to PyPI
        await new Promise(r => setTimeout(r, 100))
      }
    } else {
      console.warn(`  PyPI simple index failed: ${res.status}`)
    }
  } catch (err) {
    console.error(`  Error fetching PyPI index: ${err}`)
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

// ---- Quality filters ----

const MCP_KEYWORDS = [
  'mcp', 'model context protocol', 'modelcontextprotocol',
  'mcp server', 'mcp-server', 'mcp_server',
  'mcp tool', 'mcp plugin', 'fastmcp',
]

const FALSE_POSITIVE_KEYWORDS = [
  'minecraft', 'minecraft server', 'multicraft',
  'media control protocol', 'master control program',
  'micro channel', 'mobile content provider',
]

function isLikelyMcpServer(repo: GitHubRepo): boolean {
  // Skip forks — they're duplicates of the original
  if (repo.fork) return false

  // Skip archived repos
  if (repo.archived) return false

  const name = repo.full_name.toLowerCase()
  const desc = (repo.description || '').toLowerCase()
  const topics = repo.topics.map(t => t.toLowerCase())
  const combined = `${name} ${desc} ${topics.join(' ')}`

  // Reject false positives
  if (FALSE_POSITIVE_KEYWORDS.some(kw => desc.includes(kw))) return false

  // Must have at least one MCP keyword in name, description, or topics
  const hasMcpSignal = MCP_KEYWORDS.some(kw => combined.includes(kw))
  if (!hasMcpSignal) return false

  // Skip zero-star repos created > 6 months ago (dead on arrival)
  if (repo.stargazers_count === 0 && repo.created_at) {
    const ageMs = Date.now() - new Date(repo.created_at).getTime()
    const sixMonths = 180 * 24 * 60 * 60 * 1000
    if (ageMs > sixMonths) return false
  }

  return true
}

function isLikelyMcpNpmPackage(name: string, description: string | null): boolean {
  const lower = `${name} ${description || ''}`.toLowerCase()
  if (FALSE_POSITIVE_KEYWORDS.some(kw => lower.includes(kw))) return false
  return MCP_KEYWORDS.some(kw => lower.includes(kw))
}

function isLikelyMcpPyPIPackage(name: string, summary: string | null): boolean {
  const lower = `${name} ${summary || ''}`.toLowerCase()
  if (FALSE_POSITIVE_KEYWORDS.some(kw => lower.includes(kw))) return false
  return MCP_KEYWORDS.some(kw => lower.includes(kw))
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
    compatible_clients: inferCompatibleClients(),
    api_pricing: inferPricing(null, repo.full_name.split('/')[1], repo.description),
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
    compatible_clients: inferCompatibleClients(),
    api_pricing: inferPricing(null, pkg.name, pkg.description),
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
    compatible_clients: inferCompatibleClients(),
    api_pricing: inferPricing(null, pkg.name, pkg.summary),
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
    const qualityRepos = repos.filter(r => isLikelyMcpServer(r))
    const newRepos = qualityRepos.filter(r => !existingUrls.has(r.html_url.toLowerCase()))
    console.log(`\n${repos.length} total → ${qualityRepos.length} passed quality filter → ${newRepos.length} new`)
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
    const qualityNpm = npmPkgs.filter(p => isLikelyMcpNpmPackage(p.name, p.description || null))
    const newNpmPkgs = qualityNpm.filter(p => !existingNpmPkgs.has(p.name))
    console.log(`\n${npmPkgs.length} total → ${qualityNpm.length} passed quality filter → ${newNpmPkgs.length} new`)

    for (const pkg of newNpmPkgs) {
      const success = await insertFromNpm(pkg, existingSlugs, existingNpmPkgs)
      if (success) { totalInserted++; run.addUpdated() }
      await new Promise(r => setTimeout(r, 50))
    }

    // 3. PyPI discovery
    const pypiPkgs = await discoverFromPyPI()
    const qualityPypi = pypiPkgs.filter(p => isLikelyMcpPyPIPackage(p.name, p.summary || null))
    const newPypiPkgs = qualityPypi.filter(p => !existingPipPkgs.has(p.name))
    console.log(`\n${pypiPkgs.length} total → ${qualityPypi.length} passed quality filter → ${newPypiPkgs.length} new`)

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
