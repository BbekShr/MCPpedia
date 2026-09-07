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
  // Build tooling and dev dependencies. These come from README lines like
  // `npm install -D vitest` or a copied devDependencies block, and they are the
  // reason the first pass of this list was not enough: filtering only package
  // managers moved the trending list from ten pnpm rows to vite (176M),
  // @typescript-eslint/eslint-plugin (136M) and vitest (100M).
  'vite',
  'vitest',
  'webpack',
  'rollup',
  'esbuild',
  'turbo',
  'jest',
  'mocha',
  'playwright',
  '@playwright/test',
  'puppeteer',
  'cypress',
  'jsdom',
  'eslint',
  'prettier',
  'nodemon',
  'concurrently',
  'dotenv',
  'zod',
  'express',
  'react',
  'next',
  // The MCP SDK is the library every server depends on, never the server.
  '@modelcontextprotocol/sdk',
  // Bare flags the regexes can capture when a command is written unusually
  '-y',
  '-g',
]

/**
 * Scoped/prefixed families that are always tooling. Checked as prefixes because
 * enumerating every `@babel/plugin-*` or `eslint-plugin-*` is hopeless.
 * Prefixes are bot-side only: PostgREST `in.()` matches exact values, so the
 * download ceiling below is what protects the queries.
 */
export const NPM_PACKAGE_DENY_PREFIXES: readonly string[] = [
  '@babel/',
  '@typescript-eslint/',
  '@types/',
  '@eslint/',
  '@rollup/',
  '@vitejs/',
  '@swc/',
  'eslint-plugin-',
  'eslint-config-',
  'babel-plugin-',
  '@testing-library/',
]

/**
 * Weekly-download ceiling above which a figure is treated as mis-attributed
 * rather than real.
 *
 * The denylist alone is whack-a-mole: it can only exclude names already seen
 * going wrong. This is the backstop, and it works because the quantity itself
 * is the tell. MCP servers are a young, narrow ecosystem; the busiest genuine
 * ones sit in the hundreds of thousands per week. 5M/week would put a package
 * among the few hundred most-downloaded on all of npm, which no MCP server is
 * anywhere near. Anything above the line is a build tool wearing a server's
 * name, so excluding it costs nothing real and stops the next unseen offender
 * without another deploy.
 *
 * Raise this if the ecosystem ever genuinely gets there. It is a plausibility
 * bound, not a policy about how popular a server is allowed to be.
 */
export const MAX_PLAUSIBLE_WEEKLY_DOWNLOADS = 5_000_000

const DENYSET = new Set(NPM_PACKAGE_DENYLIST)

/** True when `pkg` is toolchain rather than an MCP server's own package. */
export function isDeniedNpmPackage(pkg: string | null | undefined): boolean {
  if (!pkg) return false
  if (DENYSET.has(pkg)) return true
  return NPM_PACKAGE_DENY_PREFIXES.some((prefix) => pkg.startsWith(prefix))
}

/**
 * True when a weekly-download figure is too large to have come from a real MCP
 * server, i.e. the package name it was fetched for is not this server's.
 */
export function isImplausibleDownloadCount(n: number | null | undefined): boolean {
  return typeof n === 'number' && n > MAX_PLAUSIBLE_WEEKLY_DOWNLOADS
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
