/**
 * Pure README parsers shared by `extract-install-info` and `extract-schemas`.
 *
 * They live here rather than in the bots because each bot builds an admin
 * client and calls `main()` at module scope, so neither can be imported by a
 * test — the same reason `lib/registry-schema.ts` exists as its own module.
 */

import { NPM_PACKAGE_DENYLIST } from '../../lib/npm-package-denylist'

export type RegexExtraction = {
  tools: Array<{ name: string; description: string }>
  resources: never[]
  prompts: never[]
}

// Installer tooling, package managers and runtimes that are never the actual
// MCP server package. Shared with the homepage trending query so the two can
// not drift — see lib/npm-package-denylist.ts for why pnpm is on the list.
export const NPX_SKIP_PACKAGES = new Set(NPM_PACKAGE_DENYLIST)

export function extractNpmPackage(readme: string): string | null {
  // Handle: npx @smithery/cli install @actual/package
  // or: npx -y @smithery/cli install @actual/package
  const smitheryInstall = readme.match(/npx\s+(?:-y\s+)?@smithery\/cli\s+install\s+(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)/m)
  if (smitheryInstall) return smitheryInstall[1]

  // Match: npx -y @scope/package or npx @scope/package
  // The trailing lookahead rejects a name that is really the scheme of an npm
  // install spec: `npx -y github:owner/repo` runs straight from GitHub, and
  // without it the bare `github` was taken as the package (#186), which then
  // pulled in the unrelated `github` package's downloads and advisories.
  const npxMatch = readme.match(/npx\s+(?:-y\s+)?(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)(?![\w.:/-])/m)
  if (npxMatch) {
    const pkg = npxMatch[1]
    if (!NPX_SKIP_PACKAGES.has(pkg)) return pkg
  }

  // Match: npm install @scope/package
  // The skip check matters most here: a "Prerequisites" section reading
  // `npm install -g pnpm` is about the toolchain, not about this server, and
  // without the guard it was scraped as the server's own package.
  const npmInstall = readme.match(/npm\s+install\s+(?:-[gD]\s+)?(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)(?![\w.:/-])/m)
  if (npmInstall && !NPX_SKIP_PACKAGES.has(npmInstall[1])) return npmInstall[1]

  // Match from package.json "name" field if present
  const pkgName = readme.match(/"name"\s*:\s*"(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)"/m)
  if (pkgName && pkgName[1].includes('mcp') && !NPX_SKIP_PACKAGES.has(pkgName[1])) return pkgName[1]

  return null
}

// MCP tool names are identifiers (`get_issue`, `searchRepos`, `arcmira_describe`),
// not Title Case words. The README section titles the old patterns picked up —
// `Study`, `License`, `Connect`, `Tools`, `Gates` (#176, #186) — all start with
// a capital, so requiring a lowercase start is what keeps them out.
const TOOL_NAME = /^[a-z][a-zA-Z0-9_-]*$/

export function extractToolsWithRegex(readme: string): RegexExtraction {
  const tools: Array<{ name: string; description: string }> = []

  // Match common patterns: `tool_name` - description, or a server.tool() call.
  // There is deliberately no `### heading` pattern: a heading followed by a
  // paragraph is how every README section starts, so it turned `## Study` and
  // its first line into a tool named "Study" and shipped that to /s/[slug].
  const patterns = [
    /[`*]+(\w+)[`*]+\s*[-:–]\s*(.+)/g,
    /server\.tool\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(readme)) !== null) {
      const name = match[1]
      const description = match[2].trim()
      if (TOOL_NAME.test(name) && name.length > 2 && name.length < 60 && description.length > 5) {
        tools.push({ name, description })
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>()
  const unique = tools.filter(t => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })

  return { tools: unique, resources: [], prompts: [] }
}
