/**
 * Audit and fix all install configs.
 * Validates npm packages exist, checks URL formats, removes bad configs.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkNpmExists(pkg: string): Promise<boolean> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  console.log('=== MCPpedia Config Audit ===\n')

  const { data: servers } = await s.from('servers')
    .select('id, slug, npm_package, pip_package, install_configs, github_url, transport')

  if (!servers) { console.log('No servers'); return }

  const withConfigs = servers.filter(srv => {
    const configs = srv.install_configs as Record<string, unknown>
    return configs && JSON.stringify(configs) !== '{}'
  })

  console.log(`Total servers: ${servers.length}`)
  console.log(`With install configs: ${withConfigs.length}`)
  console.log(`Without configs: ${servers.length - withConfigs.length}\n`)

  let valid = 0
  let fixed = 0
  let removed = 0
  const badNpm: string[] = []

  for (const srv of withConfigs) {
    const configs = srv.install_configs as Record<string, Record<string, Record<string, { command?: string; args?: string[]; url?: string }>>>
    const cd = configs?.['claude-desktop']?.mcpServers
    if (!cd) continue

    const firstKey = Object.keys(cd)[0]
    const entry = cd[firstKey]
    if (!entry) continue

    // Check remote URL configs
    if (entry.url) {
      // Native remote format — Claude Desktop may not support this yet
      // Convert to mcp-remote format
      const url = entry.url
      const fixedConfigs: Record<string, unknown> = {}
      for (const client of ['claude-desktop', 'cursor', 'claude-code']) {
        fixedConfigs[client] = {
          mcpServers: {
            [firstKey]: {
              command: 'npx',
              args: ['mcp-remote', url]
            }
          }
        }
      }
      await s.from('servers').update({ install_configs: fixedConfigs }).eq('id', srv.id)
      fixed++
      console.log(`  FIXED ${srv.slug}: converted native url to mcp-remote`)
      continue
    }

    // Check npx commands
    if (entry.command === 'npx') {
      const args = entry.args || []

      // mcp-remote proxy
      if (args.includes('mcp-remote')) {
        const url = args.find((a: string) => a.startsWith('https://'))
        if (url) {
          valid++
          continue
        } else {
          // mcp-remote without URL — broken
          await s.from('servers').update({ install_configs: {} }).eq('id', srv.id)
          removed++
          console.log(`  REMOVED ${srv.slug}: mcp-remote without URL`)
          continue
        }
      }

      // Regular npx package
      const pkg = args.find((a: string) => !a.startsWith('-') && a !== 'mcp-remote')
      if (pkg) {
        // Verify the npm package exists
        const exists = await checkNpmExists(pkg)
        if (exists) {
          valid++
        } else {
          // Package doesn't exist on npm — might be wrong name
          // Check if the server has a different npm_package
          if (srv.npm_package && srv.npm_package !== pkg) {
            const altExists = await checkNpmExists(srv.npm_package)
            if (altExists) {
              // Fix with correct package name
              const fixedConfigs: Record<string, unknown> = {}
              for (const client of ['claude-desktop', 'cursor', 'claude-code']) {
                fixedConfigs[client] = {
                  mcpServers: {
                    [firstKey]: {
                      command: 'npx',
                      args: ['-y', srv.npm_package]
                    }
                  }
                }
              }
              await s.from('servers').update({ install_configs: fixedConfigs }).eq('id', srv.id)
              fixed++
              console.log(`  FIXED ${srv.slug}: ${pkg} → ${srv.npm_package}`)
              continue
            }
          }
          // Can't fix — remove the bad config
          badNpm.push(`${srv.slug}: ${pkg}`)
          await s.from('servers').update({ install_configs: {} }).eq('id', srv.id)
          removed++
          console.log(`  REMOVED ${srv.slug}: npm package "${pkg}" not found`)
        }
        // Rate limit npm checks
        await new Promise(r => setTimeout(r, 100))
      } else {
        // npx with no package
        await s.from('servers').update({ install_configs: {} }).eq('id', srv.id)
        removed++
        console.log(`  REMOVED ${srv.slug}: npx with no package`)
      }
      continue
    }

    // Check uvx/pip commands
    if (entry.command === 'uvx' || entry.command === 'pip') {
      valid++
      continue
    }

    // Unknown format — remove
    await s.from('servers').update({ install_configs: {} }).eq('id', srv.id)
    removed++
    console.log(`  REMOVED ${srv.slug}: unknown command "${entry.command}"`)
  }

  console.log(`\n=== Results ===`)
  console.log(`Valid: ${valid}`)
  console.log(`Fixed: ${fixed}`)
  console.log(`Removed: ${removed}`)

  if (badNpm.length > 0) {
    console.log(`\nBad npm packages removed:`)
    badNpm.forEach(b => console.log(`  ${b}`))
  }

  // Count final state
  const { data: final } = await s.from('servers')
    .select('install_configs')
  const finalWithConfigs = (final || []).filter(srv => {
    const configs = srv.install_configs as Record<string, unknown>
    return configs && JSON.stringify(configs) !== '{}'
  })
  console.log(`\nFinal: ${finalWithConfigs.length} servers with valid install configs`)
}

main().catch(console.error)
