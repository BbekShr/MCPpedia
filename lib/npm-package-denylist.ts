/**
 * npm package names that are never the MCP server's own package.
 *
 * `extract-install-info` reads package names out of READMEs with regexes over
 * `npx …` and `npm install …` lines. Those lines are frequently about the
 * toolchain rather than the server: a prerequisites section saying
 * `npm install -g pnpm` used to be scraped as the server's npm package, and
 * because `update-metadata` then asks npm for that package's download count,
 * every server matched this way inherited pnpm's ~177M weekly downloads. That
 * was enough to fill the entire homepage "most installed this week" list with
 * one number repeated ten times.
 *
 * Shared between the bots (which must not write these values) and the homepage
 * trending query (which must not rank on a value already in the table), so the
 * list cannot drift between the two.
 */
export const NPM_PACKAGE_DENYLIST: readonly string[] = [
  // Installer / wrapper tooling
  '@smithery/cli',
  '@modelcontextprotocol/inspector',
  '@modelcontextprotocol/conformance',
  'mcp-remote',
  'add-mcp',
  'chrome-devtools-mcp',
  // Package managers and their runners. These are what a "prerequisites"
  // section installs, never what an MCP server publishes.
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'bunx',
  'corepack',
  'pipx',
  'uv',
  'uvx',
  // Runtimes, launchers and build tooling
  'node',
  'nodemon',
  'deno',
  'tsx',
  'ts-node',
  'typescript',
  'python',
  'python3',
  'docker',
  'git',
  // Bare flags the regexes can capture when a command is written unusually
  '-y',
  '-g',
]

const DENYSET = new Set(NPM_PACKAGE_DENYLIST)

/** True when `pkg` is toolchain rather than an MCP server's own package. */
export function isDeniedNpmPackage(pkg: string | null | undefined): boolean {
  return !!pkg && DENYSET.has(pkg)
}

/**
 * The denylist rendered for a PostgREST `in.(…)` filter.
 *
 * Every value is double-quoted: supabase-js does no quoting of its own inside
 * an `or`/`in` string, so a future entry containing a comma would silently
 * truncate the list.
 */
export function npmPackageDenylistFilter(): string {
  return NPM_PACKAGE_DENYLIST.map((p) => `"${p}"`).join(',')
}
