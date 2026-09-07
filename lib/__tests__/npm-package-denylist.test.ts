/**
 * Guards the "most installed this week" ranking.
 *
 * This bug shipped twice. First every row of the homepage top 10 read
 * `177.6M/wk`, because READMEs with an `npm install -g pnpm` prerequisite had
 * `pnpm` scraped as the server's own package and then inherited pnpm's download
 * count. Filtering package managers by name fixed that specific list and
 * immediately surfaced the next layer: vite at 176M, @typescript-eslint at
 * 136M, vitest at 100M, all arriving the same way from `npm install -D ...`
 * lines.
 *
 * So the name list is not the real defence, the plausibility ceiling is. These
 * tests pin both, and pin the fact that a real server's numbers survive them.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_PLAUSIBLE_WEEKLY_DOWNLOADS,
  isDeniedNpmPackage,
  isImplausibleDownloadCount,
  npmPackageDenylistFilter,
  NPM_PACKAGE_DENYLIST,
} from '../npm-package-denylist'

describe('isDeniedNpmPackage', () => {
  it('rejects the package managers that caused the original pnpm ranking', () => {
    for (const pkg of ['pnpm', 'npm', 'yarn', 'bun', 'npx', 'uvx', 'pipx']) {
      expect(isDeniedNpmPackage(pkg), pkg).toBe(true)
    }
  })

  it('rejects the build tooling that replaced pnpm at the top of the list', () => {
    for (const pkg of ['vite', 'vitest', 'playwright', 'jsdom', 'eslint']) {
      expect(isDeniedNpmPackage(pkg), pkg).toBe(true)
    }
  })

  it('rejects scoped tooling families by prefix, not just by exact name', () => {
    // @typescript-eslint/eslint-plugin was ranking at 135.7M/wk. Enumerating
    // every member of these families is hopeless, hence prefix matching.
    for (const pkg of [
      '@typescript-eslint/eslint-plugin',
      '@typescript-eslint/parser',
      '@babel/plugin-syntax-nullish-coalescing-operator',
      'eslint-plugin-react-hooks',
      '@types/node',
    ]) {
      expect(isDeniedNpmPackage(pkg), pkg).toBe(true)
    }
  })

  it('rejects the MCP SDK, which every server depends on and no server is', () => {
    expect(isDeniedNpmPackage('@modelcontextprotocol/sdk')).toBe(true)
  })

  it('accepts real MCP server packages', () => {
    for (const pkg of [
      '@modelcontextprotocol/server-filesystem',
      '@modelcontextprotocol/server-github',
      'mcp-server-fetch',
      'chrome-devtools-mcp-server',
      '@upstash/context7-mcp',
    ]) {
      expect(isDeniedNpmPackage(pkg), pkg).toBe(false)
    }
  })

  it('treats null and empty as not-denied so callers need no null check', () => {
    expect(isDeniedNpmPackage(null)).toBe(false)
    expect(isDeniedNpmPackage(undefined)).toBe(false)
    expect(isDeniedNpmPackage('')).toBe(false)
  })

  it('does not deny a package merely for containing a denied name', () => {
    // 'vite' is denied; 'vitepress-mcp' must not inherit that.
    expect(isDeniedNpmPackage('vitepress-mcp')).toBe(false)
    expect(isDeniedNpmPackage('npm-registry-mcp')).toBe(false)
  })
})

describe('isImplausibleDownloadCount', () => {
  it('rejects every figure that actually reached the homepage', () => {
    // The real values observed in production, in order of discovery.
    for (const n of [177_649_226, 176_345_363, 135_732_604, 99_878_658, 87_469_377]) {
      expect(isImplausibleDownloadCount(n), String(n)).toBe(true)
    }
  })

  it('accepts figures a real MCP server could plausibly reach', () => {
    for (const n of [0, 1, 12_400, 350_000, 4_999_999]) {
      expect(isImplausibleDownloadCount(n), String(n)).toBe(false)
    }
  })

  it('treats the ceiling itself as plausible, matching the .lte() in the queries', () => {
    expect(isImplausibleDownloadCount(MAX_PLAUSIBLE_WEEKLY_DOWNLOADS)).toBe(false)
    expect(isImplausibleDownloadCount(MAX_PLAUSIBLE_WEEKLY_DOWNLOADS + 1)).toBe(true)
  })

  it('ignores null so a never-enriched row is not treated as suspicious', () => {
    expect(isImplausibleDownloadCount(null)).toBe(false)
    expect(isImplausibleDownloadCount(undefined)).toBe(false)
  })
})

describe('npmPackageDenylistFilter', () => {
  it('quotes every value', () => {
    // supabase-js does no quoting inside an `in.()` string, so one future entry
    // containing a comma would silently truncate the list server-side.
    const parts = npmPackageDenylistFilter().split(',')
    expect(parts.length).toBe(NPM_PACKAGE_DENYLIST.length)
    for (const p of parts) {
      expect(p.startsWith('"') && p.endsWith('"'), p).toBe(true)
    }
  })

  it('carries the names that broke the ranking', () => {
    const filter = npmPackageDenylistFilter()
    for (const pkg of ['pnpm', 'vite', 'vitest', 'playwright']) {
      expect(filter, pkg).toContain(`"${pkg}"`)
    }
  })
})
