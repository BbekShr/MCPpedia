/**
 * Reads a decisions JSONL produced by Claude in-chat (one entry per server)
 * and updates `servers.categories` in Supabase.
 *
 * Each line: { id: string, slug: string, categories: string[], rationale?: string }
 *
 * Usage:
 *   npx tsx bots/apply-cats.ts --in data/recat/decisions.jsonl           # dry-run
 *   npx tsx bots/apply-cats.ts --in data/recat/decisions.jsonl --apply   # writes
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync, existsSync } from 'fs'
import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { CATEGORIES } from '../lib/constants'

function getArg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}

const IN = getArg('--in')
const APPLY = process.argv.includes('--apply')

if (!IN) {
  console.error('Usage: npx tsx bots/apply-cats.ts --in path.jsonl [--apply]')
  process.exit(1)
}
if (!existsSync(IN)) {
  console.error(`Input not found: ${IN}`)
  process.exit(1)
}

const valid = new Set<string>(CATEGORIES as readonly string[])

async function main() {
  console.log(`=== Apply Categorizations (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log(new Date().toISOString())

  const supabase = createAdminClient('bot-apply-cats')
  const run = await BotRun.start('apply-categorizations')

  const lines = readFileSync(IN!, 'utf8').split('\n').filter(l => l.trim())
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const line of lines) {
    let entry: { id?: string; slug?: string; categories?: unknown }
    try {
      entry = JSON.parse(line)
    } catch {
      console.error('  bad json:', line.slice(0, 80))
      skipped++
      continue
    }

    const { id, slug, categories } = entry
    if (!id || !Array.isArray(categories)) {
      console.error(`  ${slug ?? '(no slug)'}: missing id or categories`)
      skipped++
      continue
    }

    const cats = (categories as unknown[])
      .filter((c): c is string => typeof c === 'string')
      .filter(c => valid.has(c))

    if (cats.length === 0) {
      console.error(`  ${slug}: no valid categories after filtering`)
      skipped++
      continue
    }

    // Drop "other" if a specific category is also present
    const finalCats = cats.length > 1 ? cats.filter(c => c !== 'other') : cats

    if (APPLY) {
      const { error } = await supabase
        .from('servers')
        .update({ categories: finalCats })
        .eq('id', id)
      if (error) {
        console.error(`  ✗ ${slug}: ${error.message}`)
        errors++
        run.addProcessed(1)
        continue
      }
    }

    console.log(`  ${APPLY ? '✓' : '·'} ${slug} → [${finalCats.join(', ')}]`)
    updated++
    run.addProcessed(1)
    run.addUpdated(1)
  }

  run.setSummary({ updated, skipped, errors, applied: APPLY })
  await run.finish()
  console.log(`\n${APPLY ? 'Applied' : 'DRY-RUN'}: ${updated} updated, ${skipped} skipped, ${errors} errors`)
}

main().catch(async e => { console.error(e); process.exit(1) })
