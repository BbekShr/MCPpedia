/**
 * Comparison Page Generator — pre-generates comparison pairs from top MCP servers.
 * Produces a JSON file consumed by the compare page's generateStaticParams.
 * Runs weekly via GitHub Actions after score computation.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'
import { createAdminClient } from './lib/supabase'

const supabase = createAdminClient('bot-generate-comparisons')
const dataDir = path.join(process.cwd(), 'data')
const outputPath = path.join(dataDir, 'comparison-pairs.json')

// How many top servers to use (30 servers → 435 pairs)
const TOP_N = 30
// Also generate within-category pairs for the top categories
const CATEGORY_TOP_N = 10

interface ComparisonPair {
  slugA: string
  slugB: string
  nameA: string
  nameB: string
  category?: string // set if both servers share this category
}

async function main() {
  console.log('=== MCPpedia Comparison Pair Generator ===')

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // 1. Fetch top servers by score
  const { data: topServers } = await supabase
    .from('servers')
    .select('slug, name, categories, score_total, github_stars, npm_weekly_downloads')
    .eq('is_archived', false)
    .gt('score_total', 30)
    .order('score_total', { ascending: false })
    .limit(TOP_N)

  if (!topServers || topServers.length < 2) {
    console.log('Not enough servers to generate comparisons')
    return
  }

  console.log(`Fetched ${topServers.length} top servers`)

  // 2. Generate all unique pairs from top servers
  const pairs: ComparisonPair[] = []
  const pairSet = new Set<string>()

  for (let i = 0; i < topServers.length; i++) {
    for (let j = i + 1; j < topServers.length; j++) {
      const a = topServers[i]
      const b = topServers[j]
      // Alphabetical order for consistent slugs
      const [first, second] = [a, b].sort((x, y) => x.slug.localeCompare(y.slug))
      const key = `${first.slug}-vs-${second.slug}`

      if (!pairSet.has(key)) {
        pairSet.add(key)

        // Find shared category
        const catsA = (first.categories as string[]) || []
        const catsB = (second.categories as string[]) || []
        const shared = catsA.find(c => catsB.includes(c))

        pairs.push({
          slugA: first.slug,
          slugB: second.slug,
          nameA: first.name,
          nameB: second.name,
          category: shared || undefined,
        })
      }
    }
  }

  // 3. Add within-category pairs for top categories
  const topCategories = [
    'developer-tools', 'productivity', 'data', 'ai-ml',
    'communication', 'cloud', 'security', 'devops',
  ]

  for (const category of topCategories) {
    const { data: catServers } = await supabase
      .from('servers')
      .select('slug, name, categories, score_total')
      .contains('categories', [category])
      .eq('is_archived', false)
      .gt('score_total', 20)
      .order('score_total', { ascending: false })
      .limit(CATEGORY_TOP_N)

    if (!catServers || catServers.length < 2) continue

    for (let i = 0; i < catServers.length; i++) {
      for (let j = i + 1; j < catServers.length; j++) {
        const a = catServers[i]
        const b = catServers[j]
        const [first, second] = [a, b].sort((x, y) => x.slug.localeCompare(y.slug))
        const key = `${first.slug}-vs-${second.slug}`

        if (!pairSet.has(key)) {
          pairSet.add(key)
          pairs.push({
            slugA: first.slug,
            slugB: second.slug,
            nameA: first.name,
            nameB: second.name,
            category,
          })
        }
      }
    }
  }

  console.log(`Generated ${pairs.length} unique comparison pairs`)

  // 4. Write output
  const output = {
    generatedAt: new Date().toISOString(),
    totalPairs: pairs.length,
    pairs,
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`Written to ${outputPath}`)
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
