#!/usr/bin/env node

/**
 * MCPpedia CLI — install MCP servers with one command.
 * Usage: npx mcppedia install <server-slug> [--client claude-desktop|cursor|claude-code]
 */

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const API_BASE = 'https://mcppedia.org'

const CLIENT_CONFIG_PATHS: Record<string, string> = {
  'claude-desktop': join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  'cursor': join(homedir(), '.cursor', 'mcp.json'),
  'claude-code': join(process.cwd(), '.mcp.json'),
}

async function fetchServer(slug: string) {
  const res = await fetch(`${API_BASE}/api/github-metadata?slug=${slug}`)
  if (!res.ok) {
    // Try direct Supabase query via public API
    const listRes = await fetch(`${API_BASE}/api/server/${slug}`)
    if (!listRes.ok) throw new Error(`Server "${slug}" not found on MCPpedia`)
    return listRes.json()
  }
  return res.json()
}

function getConfigPath(client: string): string {
  const path = CLIENT_CONFIG_PATHS[client]
  if (!path) throw new Error(`Unknown client: ${client}. Use: claude-desktop, cursor, or claude-code`)
  return path
}

function readConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

function mergeConfig(existing: Record<string, unknown>, serverConfig: Record<string, unknown>): Record<string, unknown> {
  const mcpServers = (existing.mcpServers || {}) as Record<string, unknown>
  const newServers = (serverConfig.mcpServers || serverConfig) as Record<string, unknown>

  return {
    ...existing,
    mcpServers: {
      ...mcpServers,
      ...newServers,
    },
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
MCPpedia CLI — Install MCP servers easily

Usage:
  npx mcppedia install <server-slug> [--client <client>]
  npx mcppedia search <query>
  npx mcppedia info <server-slug>

Clients:
  claude-desktop  (default)
  cursor
  claude-code

Examples:
  npx mcppedia install slack-mcp
  npx mcppedia install github --client cursor
  npx mcppedia search "database"
`)
    return
  }

  const command = args[0]

  if (command === 'install') {
    const slug = args[1]
    if (!slug) {
      console.error('Usage: npx mcppedia install <server-slug>')
      process.exit(1)
    }

    const clientIdx = args.indexOf('--client')
    const client = clientIdx >= 0 ? args[clientIdx + 1] : 'claude-desktop'

    console.log(`Installing ${slug} for ${client}...`)

    try {
      const server = await fetchServer(slug)
      const configPath = getConfigPath(client)
      const installConfig = server.install_configs?.[client] || server.install_configs?.['claude-desktop']

      if (!installConfig) {
        console.error(`No install config found for ${slug} on ${client}.`)
        console.log(`Visit https://mcppedia.org/s/${slug} for manual setup instructions.`)
        process.exit(1)
      }

      const existing = readConfig(configPath)
      const merged = mergeConfig(existing, installConfig)

      writeFileSync(configPath, JSON.stringify(merged, null, 2))
      console.log(`\n  Added ${slug} to ${configPath}`)
      console.log(`  Restart ${client} to activate.\n`)
      console.log(`  View on MCPpedia: https://mcppedia.org/s/${slug}`)
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  } else if (command === 'search') {
    const query = args.slice(1).join(' ')
    if (!query) {
      console.error('Usage: npx mcppedia search <query>')
      process.exit(1)
    }

    console.log(`Searching MCPpedia for "${query}"...\n`)

    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()

      if (!data.servers || data.servers.length === 0) {
        console.log('No servers found.')
        return
      }

      for (const s of data.servers.slice(0, 10)) {
        const score = s.score_total ? ` [Score: ${s.score_total}]` : ''
        console.log(`  ${s.name}${score}`)
        console.log(`    ${s.tagline || ''}`)
        console.log(`    https://mcppedia.org/s/${s.slug}\n`)
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
    }
  } else if (command === 'info') {
    const slug = args[1]
    if (!slug) {
      console.error('Usage: npx mcppedia info <server-slug>')
      process.exit(1)
    }

    console.log(`Fetching info for ${slug}...\n`)

    try {
      const server = await fetchServer(slug)
      console.log(`  ${server.name}`)
      console.log(`  ${server.tagline || ''}`)
      console.log(`  Score: ${server.score_total || 'N/A'}/100`)
      console.log(`  Tools: ${server.tools?.length || 0}`)
      console.log(`  Health: ${server.health_status}`)
      console.log(`  Stars: ${server.github_stars}`)
      console.log(`  CVEs: ${server.cve_count || 0}`)
      console.log(`  https://mcppedia.org/s/${slug}`)
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
    }
  } else {
    console.error(`Unknown command: ${command}. Run with --help for usage.`)
    process.exit(1)
  }
}

main().catch(console.error)
