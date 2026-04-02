/**
 * Install Info Extractor — parses READMEs to find npm/pip packages and install configs.
 * No AI needed — uses pattern matching on common README formats.
 * Runs after discovery bot.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { getReadme } from './lib/github'
import { categorize } from './lib/categorize'

const supabase = createAdminClient()

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

function extractNpmPackage(readme: string): string | null {
  // Match: npx -y @scope/package or npx @scope/package
  const npxMatch = readme.match(/npx\s+(?:-y\s+)?(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)/m)
  if (npxMatch) {
    const pkg = npxMatch[1]
    // Filter out common non-packages
    if (!['mcp-remote', '-y', 'tsx', 'ts-node'].includes(pkg)) {
      return pkg
    }
  }

  // Match: npm install @scope/package
  const npmInstall = readme.match(/npm\s+install\s+(?:-[gD]\s+)?(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)/m)
  if (npmInstall) return npmInstall[1]

  // Match from package.json "name" field if present
  const pkgName = readme.match(/"name"\s*:\s*"(@[\w.-]+\/[\w.-]+|[\w][\w.-]*)"/m)
  if (pkgName && pkgName[1].includes('mcp')) return pkgName[1]

  return null
}

function extractPipPackage(readme: string): string | null {
  // Match: pip install package or uvx package
  const pipMatch = readme.match(/(?:pip|pip3)\s+install\s+([\w][\w.-]*)/m)
  if (pipMatch) return pipMatch[1]

  const uvxMatch = readme.match(/uvx\s+([\w][\w.-]*)/m)
  if (uvxMatch) return uvxMatch[1]

  return null
}

function extractRemoteUrl(readme: string): string | null {
  // Match: mcp-remote https://...
  const remoteMatch = readme.match(/mcp-remote['"]*\s*,?\s*['"]*\s*(https:\/\/[^\s'"]+)/m)
  if (remoteMatch) return remoteMatch[1]

  // Match: MCP Server URL: https://...
  const urlMatch = readme.match(/(?:MCP\s+(?:Server\s+)?URL|endpoint|server_url)\s*:?\s*(https:\/\/[^\s'"]+)/im)
  if (urlMatch) return urlMatch[1]

  return null
}

function extractInstallConfig(readme: string): Record<string, unknown> | null {
  // Find JSON blocks that look like MCP config
  const jsonBlocks = readme.match(/```(?:json)?\s*\n(\{[\s\S]*?"mcpServers"[\s\S]*?\})\s*\n```/gm)
  if (!jsonBlocks) return null

  for (const block of jsonBlocks) {
    const jsonStr = block.replace(/```(?:json)?\s*\n/, '').replace(/\n```/, '')
    try {
      const parsed = JSON.parse(jsonStr)
      if (parsed.mcpServers) return parsed
    } catch {
      // Try to fix common JSON issues
      try {
        const fixed = jsonStr
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/\/\/.*/g, '')
        const parsed = JSON.parse(fixed)
        if (parsed.mcpServers) return parsed
      } catch {
        continue
      }
    }
  }

  return null
}

function extractTransport(readme: string): string[] {
  const transports: string[] = []
  const lower = readme.toLowerCase()

  if (lower.includes('stdio') || lower.includes('npx') || lower.includes('command')) {
    transports.push('stdio')
  }
  if (lower.includes('sse') || lower.includes('server-sent')) {
    transports.push('sse')
  }
  if (lower.includes('streamable') || lower.includes('/mcp') || lower.includes('http transport')) {
    transports.push('http')
  }

  return transports.length > 0 ? transports : ['stdio']
}

async function main() {
  console.log('=== MCPpedia Install Info Extractor ===')
  console.log(new Date().toISOString())

  // Get all servers with a GitHub URL
  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, name, tagline, github_url, npm_package, pip_package, install_configs, transport, categories')
    .not('github_url', 'is', null)

  if (!servers) {
    console.log('No servers found.')
    return
  }

  // Process servers that need install info OR have no categories
  const needsUpdate = servers.filter(s =>
    // Missing all install info
    (!s.npm_package && !s.pip_package && (!s.install_configs || JSON.stringify(s.install_configs) === '{}'))
    // OR have package names but no README-sourced configs (auto-gen in UI is less accurate)
    || ((s.npm_package || s.pip_package) && (!s.install_configs || JSON.stringify(s.install_configs) === '{}'))
    // OR missing categories
    || !s.categories || s.categories.length === 0
  )

  console.log(`${needsUpdate.length} servers need install info or categories (out of ${servers.length} total)\n`)

  let updated = 0
  let skipped = 0

  for (const server of needsUpdate) {
    const parsed = parseGitHubUrl(server.github_url)
    if (!parsed) { skipped++; continue }

    const needsInstallInfo = !server.install_configs || JSON.stringify(server.install_configs) === '{}'
    const needsCategories = !server.categories || server.categories.length === 0

    // Only fetch README if we actually need it
    const readme = (needsInstallInfo || needsCategories)
      ? await getReadme(parsed.owner, parsed.repo)
      : null

    const updates: Record<string, unknown> = {}

    // --- Install info extraction ---
    if (needsInstallInfo) {
      if (readme) {
        const npmPkg = extractNpmPackage(readme)
        const pipPkg = extractPipPackage(readme)
        const remoteUrl = extractRemoteUrl(readme)
        const installConfig = extractInstallConfig(readme)
        const transport = extractTransport(readme)

        // Only set npm/pip if not already set from registry
        if (npmPkg && !server.npm_package) updates.npm_package = npmPkg
        if (pipPkg && !server.pip_package) updates.pip_package = pipPkg
        if (transport.length > 0) updates.transport = transport

        // Use the best available package name for config generation
        const effectiveNpm = server.npm_package || npmPkg
        const effectivePip = server.pip_package || pipPkg

        // Build install config — prefer README-sourced config over auto-generated
        if (installConfig) {
          updates.install_configs = { 'claude-desktop': installConfig }
        } else if (remoteUrl) {
          updates.install_configs = {
            'claude-desktop': {
              mcpServers: {
                [server.slug]: {
                  command: 'npx',
                  args: ['mcp-remote', remoteUrl]
                }
              }
            }
          }
        } else if (effectiveNpm) {
          updates.install_configs = {
            'claude-desktop': {
              mcpServers: {
                [server.slug]: {
                  command: 'npx',
                  args: ['-y', effectiveNpm]
                }
              }
            }
          }
        } else if (effectivePip) {
          updates.install_configs = {
            'claude-desktop': {
              mcpServers: {
                [server.slug]: {
                  command: 'uvx',
                  args: [effectivePip]
                }
              }
            }
          }
        }
      } else {
        // No README but we have package names from registry — generate configs
        const effectiveNpm = server.npm_package
        const effectivePip = server.pip_package
        if (effectiveNpm) {
          updates.install_configs = {
            'claude-desktop': {
              mcpServers: {
                [server.slug]: {
                  command: 'npx',
                  args: ['-y', effectiveNpm]
                }
              }
            }
          }
        } else if (effectivePip) {
          updates.install_configs = {
            'claude-desktop': {
              mcpServers: {
                [server.slug]: {
                  command: 'uvx',
                  args: [effectivePip]
                }
              }
            }
          }
        }
      }
    }

    // --- Auto-categorization ---
    if (needsCategories) {
      const cats = categorize(server.name, server.tagline, readme)
      updates.categories = cats
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('servers').update(updates).eq('id', server.id)
      if (!error) {
        const parts: string[] = []
        if (updates.install_configs) parts.push('install')
        if (updates.npm_package) parts.push('npm')
        if (updates.pip_package) parts.push('pip')
        if (updates.categories) parts.push(`cats:${(updates.categories as string[]).join(',')}`)
        console.log(`  ✓ ${server.slug}: ${parts.join('+')}`)
        updated++
      }
    } else {
      skipped++
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`)
}

main().catch(console.error)
