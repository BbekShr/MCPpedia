const GITHUB_TOKEN = process.env.GITHUB_TOKEN

function headers() {
  const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (GITHUB_TOKEN) h.Authorization = `Bearer ${GITHUB_TOKEN}`
  return h
}

export interface RepoMetadata {
  name: string
  description: string | null
  license: string | null
  owner: string
  stars: number
  language: string | null
  topics: string[]
  archived: boolean
  lastCommit: string | null
  openIssues: number
  homepage: string | null
}

export async function parseGitHubUrl(url: string): Promise<{ owner: string; repo: string } | null> {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

export async function fetchRepoMetadata(githubUrl: string): Promise<RepoMetadata | null> {
  const parsed = await parseGitHubUrl(githubUrl)
  if (!parsed) return null

  const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
    headers: headers(),
    next: { revalidate: 3600 },
  })

  if (!res.ok) return null

  const data = await res.json()

  return {
    name: data.name,
    description: data.description,
    license: data.license?.spdx_id || null,
    owner: data.owner?.login,
    stars: data.stargazers_count,
    language: data.language,
    topics: data.topics || [],
    archived: data.archived,
    lastCommit: data.pushed_at,
    openIssues: data.open_issues_count,
    homepage: data.homepage || null,
  }
}

export async function fetchReadme(githubUrl: string): Promise<string | null> {
  const parsed = await parseGitHubUrl(githubUrl)
  if (!parsed) return null

  const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`, {
    headers: { ...headers(), Accept: 'application/vnd.github.raw+json' },
  })

  if (!res.ok) return null
  return res.text()
}

export async function searchGitHubRepos(query: string, perPage = 30): Promise<Array<{ full_name: string; html_url: string; description: string | null; stargazers_count: number }>> {
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=stars&order=desc`,
    { headers: headers() }
  )

  if (!res.ok) return []
  const data = await res.json()
  return data.items || []
}
