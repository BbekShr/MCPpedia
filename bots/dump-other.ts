/**
 * Dumps a batch of servers currently in the "other" category to a JSONL file
 * so they can be classified in-chat. Fetches README inline.
 *
 * Usage:
 *   npx tsx bots/dump-other.ts --batch 50 --out data/recat/batch-001.jsonl
 *
 * Skips IDs already present in data/recat/decisions.jsonl (resume support).
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { createAdminClient } from './lib/supabase'
import { getReadme } from './lib/github'

function getArg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}

function parseGitHubUrl(url: string | null): { owner: string; repo: string } | null {
  if (!url) return null
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

const BATCH = Number(getArg('--batch') ?? 50)
const OUT = getArg('--out')
const DECISIONS = 'data/recat/decisions.jsonl'

if (!OUT) {
  console.error('Usage: npx tsx bots/dump-other.ts --batch N --out path.jsonl')
  process.exit(1)
}

const supabase = createAdminClient('bot-dump-other')

async function main() {
  console.log('=== MCPpedia Dump Other ===')
  console.log(new Date().toISOString())

  const decided = new Set<string>()
  if (existsSync(DECISIONS)) {
    for (const line of readFileSync(DECISIONS, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { decided.add(JSON.parse(line).id) } catch { /* skip bad line */ }
    }
    console.log(`Skipping ${decided.size} already-decided servers`)
  }

  const { data: servers, error } = await supabase
    .from('servers')
    .select('id, slug, name, description, github_url, categories')
    .eq('is_archived', false)
    .or('categories.eq.{other},categories.is.null')
    .order('github_stars', { ascending: false, nullsFirst: false })
    .limit(BATCH * 4)

  if (error) {
    console.error('Supabase query failed:', error.message)
    process.exit(1)
  }

  const picked = (servers ?? []).filter(s => !decided.has(s.id)).slice(0, BATCH)
  console.log(`Picked ${picked.length} servers (target ${BATCH})`)

  const lines: string[] = []
  let withReadme = 0
  for (const s of picked) {
    const parsed = parseGitHubUrl(s.github_url)
    const readme = parsed ? await getReadme(parsed.owner, parsed.repo) : null
    if (readme) withReadme++
    lines.push(JSON.stringify({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description ?? '',
      github_url: s.github_url,
      readme: (readme ?? '').slice(0, 3000),
    }))
    await new Promise(r => setTimeout(r, 200))
  }

  mkdirSync(dirname(OUT!), { recursive: true })
  writeFileSync(OUT!, lines.join('\n') + (lines.length ? '\n' : ''))
  console.log(`Wrote ${lines.length} servers to ${OUT} (${withReadme} with README)`)
}

main().catch(e => { console.error(e); process.exit(1) })
