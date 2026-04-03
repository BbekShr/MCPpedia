/**
 * Fix server names — replace registry IDs with human-readable names.
 * Sources: registry metadata tagline, GitHub repo description, or smart parsing.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isRegistryName(name: string): boolean {
  return name.includes('/') || name.startsWith('io.') || name.startsWith('ai.') || name.startsWith('com.') || name.startsWith('trade.') || name.startsWith('dev.')
}

function humanizeName(registryName: string): string {
  // io.github.ashwinvis/scb-opendata-mcp → Scb Opendata Mcp
  // ai.smithery/kodey-ai-salesforce-mcp → Kodey Ai Salesforce Mcp
  const parts = registryName.split('/')
  const raw = parts[parts.length - 1] || parts[0]

  return raw
    .replace(/^mcp-server-|^mcp-|-mcp-server$|-mcp$/gi, '') // strip mcp boilerplate
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
    || raw.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

function makeProperName(humanized: string): string {
  // Add "MCP Server" suffix if not already there
  if (humanized.toLowerCase().includes('mcp') || humanized.toLowerCase().includes('server')) {
    return humanized
  }
  return humanized + ' MCP Server'
}

async function main() {
  console.log('=== Fix Server Names ===\n')

  const { data: servers } = await s
    .from('servers')
    .select('id, slug, name, tagline, github_url')
    .eq('is_archived', false)

  if (!servers) { console.log('No servers'); return }

  const needsFix = servers.filter(srv => isRegistryName(srv.name))
  console.log(`${needsFix.length} servers need name fixes\n`)

  let fixed = 0

  for (const srv of needsFix) {
    // Priority 1: Use tagline as name if it's short and descriptive
    if (srv.tagline && srv.tagline.length > 5 && srv.tagline.length < 80 && !isRegistryName(srv.tagline)) {
      // Tagline is often the real name/description
      let name = srv.tagline
      // If tagline is a sentence, just take the first part
      if (name.length > 50) {
        name = makeProperName(humanizeName(srv.name))
      }
      await s.from('servers').update({ name }).eq('id', srv.id)
      console.log(`  ✓ ${srv.slug}: "${srv.name}" → "${name}" (from tagline)`)
      fixed++
      continue
    }

    // Priority 2: Smart parse from registry ID
    const humanized = humanizeName(srv.name)
    const proper = makeProperName(humanized)

    if (proper !== srv.name) {
      await s.from('servers').update({ name: proper }).eq('id', srv.id)
      console.log(`  ✓ ${srv.slug}: "${srv.name}" → "${proper}" (parsed)`)
      fixed++
    }
  }

  console.log(`\nDone. Fixed ${fixed} names.`)
}

main().catch(console.error)
