/**
 * Description Enricher — fetches first paragraph of README for servers missing descriptions.
 * Free — no AI needed, just GitHub API.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient, fetchAllRows } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getReadme } from './lib/github'

const supabase = createAdminClient('bot-enrich-descriptions')

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

function extractDescription(readme: string): string | null {
  const lines = readme.split('\n')

  // Skip badges, images, HTML, empty lines, and headings at the top
  const paragraphs: string[] = []
  let currentParagraph = ''

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines, badges, images, HTML tags, and headings
    if (!trimmed) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph.trim())
        currentParagraph = ''
      }
      continue
    }

    // Skip badges, images, HTML
    if (trimmed.startsWith('![') || trimmed.startsWith('<') || trimmed.startsWith('[![') || trimmed.startsWith('|')) continue
    // Skip headings
    if (trimmed.startsWith('#')) { continue }
    // Skip short lines that look like links or badges
    if (trimmed.length < 20 && (trimmed.includes('http') || trimmed.includes('['))) continue

    // This looks like real text
    if (trimmed.length > 30) {
      currentParagraph += ' ' + trimmed
    }
  }

  if (currentParagraph) paragraphs.push(currentParagraph.trim())

  // Return first real paragraph
  for (const p of paragraphs) {
    if (p.length > 50 && p.length < 1000) {
      // Clean up
      return p
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links, keep text
        .replace(/\*\*([^*]+)\*\*/g, '$1')         // remove bold
        .replace(/\*([^*]+)\*/g, '$1')              // remove italic
        .replace(/`([^`]+)`/g, '$1')                // remove inline code
        .trim()
        .slice(0, 500) // cap at 500 chars
    }
  }

  return null
}

async function main() {
  const run = await BotRun.start('enrich-descriptions')
  try {
    console.log('=== MCPpedia Description Enricher ===')
    console.log(new Date().toISOString())

    // Ask Postgres for the short ones instead of downloading every description
    // in the catalog to measure it here. A LIKE pattern of N underscores plus %
    // matches "at least N characters", so negating it selects exactly the rows
    // shorter than the threshold; NULLs never match LIKE either way, hence the
    // explicit is.null arm.
    const MIN_DESCRIPTION_LENGTH = 30
    const shortOrMissing = [
      'description.is.null',
      `description.not.like.${'_'.repeat(MIN_DESCRIPTION_LENGTH)}%`,
    ].join(',')

    const servers = await fetchAllRows<{ id: string; slug: string; github_url: string; description: string | null; description_source: string | null }>(
      supabase
        .from('servers')
        .select('id, slug, github_url, description, description_source')
        .not('github_url', 'is', null)
        .eq('is_archived', false)
        .neq('description_source', 'human')
        .or(shortOrMissing)
        .order('id')
    )

    // Kept as the authority on what counts as short. Postgres counts characters
    // and JS counts UTF-16 units, so the query is a superset for descriptions
    // containing astral characters — a handful of extra rows, filtered here.
    const needsDesc = servers.filter(s => !s.description || s.description.length < MIN_DESCRIPTION_LENGTH)
    console.log(`${needsDesc.length} servers need descriptions (out of ${servers.length} candidates)\n`)
    run.addProcessed(needsDesc.length)

    let enriched = 0
    let skipped = 0

    for (const server of needsDesc) {
      const parsed = parseGitHubUrl(server.github_url)
      if (!parsed) { skipped++; continue }

      const readme = await getReadme(parsed.owner, parsed.repo)
      if (!readme) { skipped++; continue }

      const desc = extractDescription(readme)
      if (desc) {
        await supabase.from('servers').update({ description: desc }).eq('id', server.id)
        console.log(`  ✓ ${server.slug}: ${desc.slice(0, 60)}...`)
        enriched++
        run.addUpdated()
      } else {
        skipped++
      }

      await new Promise(r => setTimeout(r, 200))
    }

    console.log(`\nDone. Enriched: ${enriched}, Skipped: ${skipped}`)
    run.setSummary({ enriched, skipped })
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(e => { console.error(e); process.exit(1) })
