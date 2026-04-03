/**
 * Duplicate Detector — finds servers pointing to the same GitHub repo.
 * Keeps the one with the highest data quality, archives the rest.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'

const supabase = createAdminClient()

async function main() {
  console.log('=== MCPpedia Duplicate Detector ===')
  console.log(new Date().toISOString())

  const { data: servers } = await supabase
    .from('servers')
    .select('id, slug, name, github_url, data_quality, score_total')
    .not('github_url', 'is', null)
    .eq('is_archived', false)
    .order('data_quality', { ascending: false })

  if (!servers) { console.log('No servers'); return }

  // Group by normalized GitHub URL
  const byUrl = new Map<string, typeof servers>()

  for (const server of servers) {
    const url = server.github_url.toLowerCase().replace(/\.git$/, '').replace(/\/$/, '')
    if (!byUrl.has(url)) byUrl.set(url, [])
    byUrl.get(url)!.push(server)
  }

  let duplicateGroups = 0
  let archived = 0

  for (const [url, group] of byUrl) {
    if (group.length <= 1) continue

    duplicateGroups++
    // Keep the first one (highest data_quality due to sort)
    const keep = group[0]
    const dupes = group.slice(1)

    console.log(`  Duplicates for ${url}:`)
    console.log(`    KEEP: ${keep.slug} (quality: ${keep.data_quality}, score: ${keep.score_total})`)

    for (const dupe of dupes) {
      console.log(`    ARCHIVE: ${dupe.slug} (quality: ${dupe.data_quality}, score: ${dupe.score_total})`)
      await supabase.from('servers').update({ is_archived: true }).eq('id', dupe.id)
      archived++
    }
  }

  console.log(`\nDone. Duplicate groups: ${duplicateGroups}, Archived: ${archived}`)
}

main().catch(console.error)
