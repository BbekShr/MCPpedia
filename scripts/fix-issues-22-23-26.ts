/**
 * One-off data fixes for GitHub issues #26, #23, #22.
 * Facts verified 2026-07-18 against GitHub (raw.githubusercontent + redirects):
 *   #26 mizcausevic-dev/mcp-kinetic-gain — repo NOT archived, LICENSE=AGPL-3.0,
 *       package.json license=AGPL-3.0, README documents a large tool catalog.
 *   #23 hive-intel/hive-crypto-mcp 301-redirects to hive-intel/hive-sdk (canonical).
 *   #22 manchittlab/TheCrawler — live repo, LICENSE=AGPL-3.0, not yet in catalog.
 *
 * Run: npx tsx scripts/fix-issues-22-23-26.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function fetchRawReadme(owner: string, repo: string): Promise<string | null> {
  for (const branch of ['main', 'master']) {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`)
    if (res.ok) return res.text()
  }
  return null
}

async function extractToolsWithHaiku(readme: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `Extract all MCP tools, resources, and prompts from this server README. Return JSON only with this exact structure:
{
  "tools": [{"name": "tool_name", "description": "what it does", "input_schema": {"type": "object", "properties": {}, "required": []}}],
  "resources": [{"name": "resource_name", "description": "what it provides", "uri_template": "template"}],
  "prompts": [{"name": "prompt_name", "description": "what it does"}]
}
If you can't find any tools/resources/prompts, return empty arrays. Return ONLY valid JSON, no markdown fences.

README:
${readme.slice(0, 8000)}`,
      }],
    }),
  })
  if (!res.ok) { console.error('Haiku API error:', res.status); return null }
  const data = await res.json()
  const text = data.content?.[0]?.text || '{}'
  try { return JSON.parse(text) } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch { /* fall through */ } }
    return null
  }
}

async function main() {
  // ---- #26: io-github-mizcausevic-dev-mcp-kinetic-gain ----
  console.log('== #26 kinetic-gain ==')
  {
    const slug = 'io-github-mizcausevic-dev-mcp-kinetic-gain'
    const readme = await fetchRawReadme('mizcausevic-dev', 'mcp-kinetic-gain')
    let toolsPayload: Record<string, unknown> = {}
    if (readme) {
      const ex = await extractToolsWithHaiku(readme)
      if (ex && ex.tools?.length) {
        toolsPayload = { tools: ex.tools, resources: ex.resources || [], prompts: ex.prompts || [] }
        console.log(`extracted ${ex.tools.length} tools`)
      } else console.warn('tool extraction returned nothing — leaving tools untouched')
    } else console.warn('no README fetched — leaving tools untouched')

    const { data, error } = await s.from('servers').update({
      is_archived: false,
      health_status: 'unknown',
      license: 'AGPL-3.0',
      ...toolsPayload,
    }).eq('slug', slug).select('slug, is_archived, license')
    console.log(error ? `ERROR: ${error.message}` : data)
  }

  // ---- #23: hive-crypto-mcp -> canonical hive-sdk ----
  console.log('== #23 hive ==')
  {
    const { data, error } = await s.from('servers').update({
      name: 'Hive Intelligence MCP',
      github_url: 'https://github.com/hive-intel/hive-sdk',
      homepage_url: 'https://hiveintelligence.xyz',
      npm_package: 'hive-intelligence',
    }).eq('slug', 'hive-crypto-mcp').select('slug, name, github_url, homepage_url, npm_package')
    console.log(error ? `ERROR: ${error.message}` : data)
  }

  // ---- #22: TheCrawler already exists as an archived, unenriched import
  //          (slug io-github-manchittlab-thecrawler). Unarchive + enrich it. ----
  console.log('== #22 TheCrawler ==')
  {
    const slug = 'io-github-manchittlab-thecrawler'
    const readme = await fetchRawReadme('manchittlab', 'TheCrawler')
    let toolsPayload: Record<string, unknown> = {}
    if (readme) {
      const ex = await extractToolsWithHaiku(readme)
      if (ex && ex.tools?.length) {
        toolsPayload = { tools: ex.tools, resources: ex.resources || [], prompts: ex.prompts || [] }
        console.log(`extracted ${ex.tools.length} tools`)
      } else console.warn('tool extraction returned nothing — leaving tools untouched')
    } else console.warn('no README fetched — leaving tools untouched')

    const { data, error } = await s.from('servers').update({
      name: 'TheCrawler',
      is_archived: false,
      health_status: 'unknown',
      license: 'AGPL-3.0-or-later',
      homepage_url: 'https://www.miaibot.ai/tools/thecrawler',
      categories: ['browser', 'search', 'data'],
      ...toolsPayload,
    }).eq('slug', slug).select('slug, name, is_archived, license')
    console.log(error ? `ERROR: ${error.message}` : data)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
