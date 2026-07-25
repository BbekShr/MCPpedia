/**
 * Schema Extractor — extracts MCP tools from server READMEs using Claude Haiku.
 * Triggered via workflow_dispatch.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { z } from 'zod'
import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getReadme } from './lib/github'

const supabase = createAdminClient('bot-extract-schemas')

// The model's JSON is untrusted: it can return the wrong shape (a string where
// an array belongs) or omit keys entirely. `servers.tools` is read back by
// compute-scores as `Tool[]` and `.filter()`ed, so a malformed value written
// here corrupts scoring — validate before ANY write, and skip on mismatch.
const extractionSchema = z.object({
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    input_schema: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  resources: z.array(z.object({
    name: z.string(),
    description: z.string(),
    uri_template: z.string().optional(),
  })).optional(),
  prompts: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).optional(),
})

type Extraction = z.infer<typeof extractionSchema>

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

// Returns null when the model answered but its JSON didn't match the schema —
// the caller skips that server rather than writing or guessing.
async function extractToolsWithHaiku(readme: string): Promise<Extraction | null> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
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
  const text: string = data.content?.[0]?.text || '{}'

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // Try extracting JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        raw = JSON.parse(jsonMatch[0])
      } catch {
        // Fall through to the regex extractor
      }
    }
  }

  if (raw === undefined) return extractToolsWithRegex(readme)

  const parsed = extractionSchema.safeParse(raw)
  if (!parsed.success) {
    // Deliberately NOT the regex fallback: a mis-shaped response is evidence the
    // model answered badly, not that the README is regex-parseable. The regex
    // patterns happily turn a `## Installation` heading into a tool named
    // "Installation", which then renders on /s/[slug] and counts toward
    // scanned_servers. Skipping leaves `tools = '[]'` so the next run retries.
    console.warn(`  Model returned a non-conforming shape (${parsed.error.issues[0]?.message}) — skipping`)
    return null
  }
  return parsed.data
}

function extractToolsWithRegex(readme: string): Extraction {
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
  const run = await BotRun.start('extract-schemas')
  try {
  console.log('=== MCPpedia Schema Extractor ===')
  console.log(new Date().toISOString())

  // Get servers that need tool extraction (empty tools array)
  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, github_url, tools')
    .not('github_url', 'is', null)
    .filter('tools', 'eq', '[]')
    .limit(200)

  if (!servers || servers.length === 0) {
    console.log('No servers need schema extraction.')
    return
  }

  console.log(`Extracting schemas for ${servers.length} servers...`)

  let extracted = 0
  let failed = 0
  let skipped = 0

  for (const server of servers) {
    // One bad README/API response must not abort the whole batch — without this
    // the remaining servers of the 200-row batch are dropped for the day.
    try {
      const parsed = parseGitHubUrl(server.github_url)
      if (!parsed) continue

      console.log(`  Processing ${server.slug}...`)

      const readme = await getReadme(parsed.owner, parsed.repo)
      if (!readme) {
        console.warn(`  No README found for ${server.slug}`)
        continue
      }

      const extraction = await extractToolsWithHaiku(readme)
      if (!extraction) skipped++

      // Write only what was actually extracted: always sending all three keys
      // blanks any existing resources/prompts on a row selected purely for
      // having `tools = '[]'`.
      const { tools, resources, prompts } = extraction ?? {}
      const updates: Record<string, unknown> = {}
      if (tools?.length) updates.tools = tools
      if (resources?.length) updates.resources = resources
      if (prompts?.length) updates.prompts = prompts

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('servers')
          .update(updates)
          .eq('id', server.id)

        if (error) {
          console.error(`  Error updating ${server.slug}: ${error.message}`)
          failed++
        } else {
          console.log(`  Extracted ${tools?.length ?? 0} tools, ${resources?.length ?? 0} resources, ${prompts?.length ?? 0} prompts`)
          extracted++
        }
      }
    } catch (err) {
      console.error(`  Exception for ${server.slug}: ${String(err).slice(0, 200)}`)
      failed++
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  run.addProcessed(servers.length)
  run.addUpdated(extracted)
  run.setSummary({ extracted, failed, skipped })
  console.log(`\nDone. Extracted schemas for ${extracted} servers (${failed} failed, ${skipped} skipped on a bad model response).`)
  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
