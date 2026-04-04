function headers() {
  const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  const token = process.env.GITHUB_TOKEN
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export interface GitHubRepo {
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  pushed_at: string
  created_at: string
  archived: boolean
  fork: boolean
  open_issues_count: number
  license: { spdx_id: string } | null
  owner: { login: string }
  topics: string[]
  language: string | null
  homepage: string | null
}

export async function searchRepos(query: string, perPage = 100): Promise<GitHubRepo[]> {
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=stars&order=desc`,
    { headers: headers() }
  )
  if (!res.ok) {
    console.error(`GitHub search failed: ${res.status} ${res.statusText}`)
    return []
  }
  const data = await res.json()
  return data.items || []
}

/** Paginated search — fetches up to maxPages pages (max 1000 results per query from GitHub) */
export async function searchReposPaginated(query: string, maxPages = 10, perPage = 100): Promise<GitHubRepo[]> {
  const all: GitHubRepo[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}&sort=stars&order=desc&page=${page}`,
      { headers: headers() }
    )
    if (!res.ok) {
      if (res.status === 422) break // GitHub returns 422 when page * perPage > 1000
      console.error(`GitHub search page ${page} failed: ${res.status}`)
      break
    }
    const data = await res.json()
    const items = data.items || []
    all.push(...items)
    if (items.length < perPage) break // no more results
    await new Promise(r => setTimeout(r, 2500)) // stay under 30 req/min
  }
  return all
}

export async function getRepo(owner: string, repo: string): Promise<GitHubRepo | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: headers(),
  })
  if (!res.ok) return null
  return res.json()
}

export async function getReadme(owner: string, repo: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
    headers: { ...headers(), Accept: 'application/vnd.github.raw+json' },
  })
  if (!res.ok) return null
  return res.text()
}

export async function getReleases(owner: string, repo: string): Promise<Array<{ tag_name: string; name: string; body: string; html_url: string; published_at: string }>> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`, {
    headers: headers(),
  })
  if (!res.ok) return []
  return res.json()
}
