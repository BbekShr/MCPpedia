/**
 * Schema Extractor — extracts MCP tools from server READMEs using Claude Haiku.
 * Triggered via workflow_dispatch.
 */

import { createAdminClient } from './lib/supabase'
import { getReadme } from './lib/github'

const supabase = createAdminClient()
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function extractToolsWithHaiku(readme: string): Promise<{
  tools: Array<{ name: string; description: string; input_schema?: Record<string, unknown> }>
  resources: Array<{ name: string; description: string; uri_template?: string }>
  prompts: Array<{ name: string; description: string }>
}> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('No ANTHROPIC_API_KEY — falling back to regex extraction')
    return extractToolsWithRegex(readme)
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Extract all MCP tools, resources, and prompts from this server README. Return JSON only with this exact structure:
{
  "tools": [{"name": "tool_name", "description": "what it does", "input_schema": {"type": "object", "properties": {...}, "required": [...]}}],
  "resources": [{"name": "resource_name", "description": "what it provides", "uri_template": "template"}],
  "prompts": [{"name": "prompt_name", "description": "what it does"}]
}

If you can't find any tools/resources/prompts, return empty arrays. Return ONLY valid JSON, no markdown fences.

README:
${readme.slice(0, 8000)}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    console.error(`Haiku API error: ${res.status}`)
    return extractToolsWithRegex(readme)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'

  try {
    return JSON.parse(text)
  } catch {
    // Try extracting JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch {
        // Fall through
      }
    }
    return extractToolsWithRegex(readme)
  }
}

function extractToolsWithRegex(readme: string): {
  tools: Array<{ name: string; description: string }>
  resources: Array<{ name: string; description: string }>
  prompts: Array<{ name: string; description: string }>
} {
  const tools: Array<{ name: string; description: string }> = []

  // Match common patterns: `tool_name` - description, or ### tool_name
  const patterns = [
    /[`*]+(\w+)[`*]+\s*[-:–]\s*(.+)/g,
    /###?\s+(\w+)\s*\n+(.+)/g,
    /server\.tool\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(readme)) !== null) {
      const name = match[1]
      const description = match[2].trim()
      if (name.length > 2 && name.length < 60 && description.length > 5) {
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

async function main() {
  console.log('=== MCPpedia Schema Extractor ===')
  console.log(new Date().toISOString())

  // Get servers that haven't had their tools extracted yet
  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, github_url, tools')
    .not('github_url', 'is', null)
    .or('tools.eq.[]')
    .limit(50)

  if (!servers || servers.length === 0) {
    console.log('No servers need schema extraction.')
    return
  }

  console.log(`Extracting schemas for ${servers.length} servers...`)

  let extracted = 0

  for (const server of servers) {
    const parsed = parseGitHubUrl(server.github_url)
    if (!parsed) continue

    console.log(`  Processing ${server.slug}...`)

    const readme = await getReadme(parsed.owner, parsed.repo)
    if (!readme) {
      console.warn(`  No README found for ${server.slug}`)
      continue
    }

    const { tools, resources, prompts } = await extractToolsWithHaiku(readme)

    if (tools.length > 0 || resources.length > 0 || prompts.length > 0) {
      const { error } = await supabase
        .from('servers')
        .update({ tools, resources, prompts })
        .eq('id', server.id)

      if (error) {
        console.error(`  Error updating ${server.slug}: ${error.message}`)
      } else {
        console.log(`  Extracted ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts`)
        extracted++
      }
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone. Extracted schemas for ${extracted} servers.`)
}

main().catch(console.error)
