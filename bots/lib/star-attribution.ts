/**
 * Star attribution — decide whether a repo's star count belongs to a server.
 *
 * `github_stars` is written from the GitHub repo behind `github_url`. For a
 * server discovered on npm that url is the package's `repository` field, which
 * for a monorepo package points at the WHOLE repo. The catalog was therefore
 * crediting each package with its host repo's entire following:
 *
 *   eslint-plugin-react-hooks  248,006 stars  (facebook/react)
 *   @deepseek-ai/dsh-mcp-client 201,958 stars  (deepseek-ai/deepseek-harness)
 *   @babel/plugin-syntax-*      43,985 stars each (babel/babel, three of them)
 *
 * That is not cosmetic. Stars are worth up to 5 maintenance points in
 * lib/scoring.ts, and bots/track-trending.ts only examines the top 500 servers
 * by star count — so inflated rows both score above their merit and crowd
 * genuine movers off the trending list, taking their fabricated "gains" (the
 * host repo's movement) with them.
 *
 * Two independent signals say "this server is not the repo":
 *
 *  1. npm's `repository.directory` — the canonical declaration that a package
 *     lives in a subdirectory of a larger repo. Catches vite, context7,
 *     eslint-plugin-react-hooks, dsh-mcp-client.
 *  2. More than one catalog server resolving to the same repo — whoever owns
 *     those stars, they cannot belong to several servers at once. Catches the
 *     monorepos that never declared a directory (babel/babel,
 *     modelcontextprotocol/servers).
 *
 * Neither signal alone is sufficient: of the 30 highest-star npm-backed
 * servers, only 12 declare a directory.
 *
 * Servers that lose an inherited count are not left unrepresented. Package
 * popularity is carried by `npm_weekly_downloads`, which scoreMaintenance
 * rewards separately (0-5). Stars measure a repository; downloads measure the
 * package. Using the right one for each is the fix.
 */

/** Normalise a git/npm repository URL to `host/owner/repo` for comparison. */
export function normalizeRepoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  // Lowercase FIRST. Stripping the scheme with a case-sensitive pattern before
  // folding case leaves `HTTPS://GitHub.com/x` as its own key, which splits one
  // repo across two census entries and lets the inherited stars through.
  const cleaned = url
    .trim()
    .toLowerCase()
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
  return cleaned || null
}

export interface AttributionInput {
  /** npm's `repository.directory`, when the package declares one. */
  npmDirectory?: string | null
  /** How many non-archived catalog servers resolve to this same repo. */
  serversSharingRepo?: number
}

export interface AttributionVerdict {
  /** May this server be credited with the repo's star count? */
  attribute: boolean
  /** Machine-readable cause, for logging and the backfill's dry run. */
  reason: 'own-repo' | 'monorepo-subdirectory' | 'repo-shared-by-multiple-servers'
}

/**
 * A package in a subdirectory is not the repository, and a repository claimed
 * by several servers cannot have its following assigned to any one of them.
 * Anything else is treated as owning its repo — the default stays permissive so
 * a missing npm lookup never silently zeroes a legitimate count.
 */
export function decideStarAttribution(input: AttributionInput): AttributionVerdict {
  const dir = input.npmDirectory?.trim().replace(/^\.?\//, '').replace(/\/+$/, '')
  if (dir && dir !== '.') {
    return { attribute: false, reason: 'monorepo-subdirectory' }
  }
  if ((input.serversSharingRepo ?? 1) > 1) {
    return { attribute: false, reason: 'repo-shared-by-multiple-servers' }
  }
  return { attribute: true, reason: 'own-repo' }
}

/**
 * Read `repository.directory` off the npm packument for `packageName`.
 *
 * Returns null both when the package declares no directory and when the lookup
 * fails — a registry hiccup must not be read as "this is a monorepo package"
 * and wipe a real star count. The shared-repo signal still applies either way.
 */
export async function fetchNpmRepositoryDirectory(packageName: string): Promise<string | null> {
  try {
    // Full packument, NOT the abbreviated `application/vnd.npm.install-v1+json`
    // document: the abbreviated form omits `repository` altogether, so asking
    // for it makes this function return null for every package and silently
    // disables the monorepo signal.
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = await res.json() as {
      'dist-tags'?: Record<string, string>
      versions?: Record<string, { repository?: unknown }>
      repository?: unknown
    }
    const latest = body['dist-tags']?.latest
    const repo = (latest && body.versions?.[latest]?.repository) || body.repository
    if (repo && typeof repo === 'object' && 'directory' in repo) {
      const dir = (repo as { directory?: unknown }).directory
      return typeof dir === 'string' && dir.trim() ? dir : null
    }
    return null
  } catch {
    return null
  }
}
