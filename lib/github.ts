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

export type RepoMetadataError = 'invalid_url' | 'not_found' | 'rate_limited' | 'upstream_error'

export type RepoMetadataResult =
  | { ok: true; metadata: RepoMetadata }
  | { ok: false; error: RepoMetadataError }

/**
 * Like fetchRepoMetadata but reports WHY a fetch failed, so API routes can
 * surface an actionable message (e.g. GitHub rate limit vs repo not found).
 */
export async function fetchRepoMetadataResult(githubUrl: string): Promise<RepoMetadataResult> {
  const parsed = await parseGitHubUrl(githubUrl)
  if (!parsed) return { ok: false, error: 'invalid_url' }

  let res: Response
  try {
    res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers: headers(),
      next: { revalidate: 3600 },
    })
  } catch (e) {
    console.error(`github metadata fetch failed for ${parsed.owner}/${parsed.repo}:`, (e as Error).message)
    return { ok: false, error: 'upstream_error' }
  }

  if (!res.ok) {
    // GitHub signals rate limiting via 429, or 403 with X-RateLimit-Remaining: 0
    const rateLimited =
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
    console.error(
      `github metadata fetch for ${parsed.owner}/${parsed.repo} returned ${res.status}` +
      (rateLimited ? ' (rate limited — check GITHUB_TOKEN)' : '')
    )
    if (rateLimited) return { ok: false, error: 'rate_limited' }
    if (res.status === 404) return { ok: false, error: 'not_found' }
    return { ok: false, error: 'upstream_error' }
  }

  const data = await res.json()

  return {
    ok: true,
    metadata: {
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
    },
  }
}

export async function fetchRepoMetadata(githubUrl: string): Promise<RepoMetadata | null> {
  const result = await fetchRepoMetadataResult(githubUrl)
  return result.ok ? result.metadata : null
}

export async function fetchReadme(githubUrl: string): Promise<string | null> {
  const parsed = await parseGitHubUrl(githubUrl)
  if (!parsed) return null

  const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`, {
    headers: { ...headers(), Accept: 'application/vnd.github.raw+json' },
    next: { revalidate: 86400 },
  })

  if (!res.ok) return null
  return res.text()
}
