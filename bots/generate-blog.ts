/**
 * Blog Generator — auto-generates blog posts from MCPpedia data using Claude.
 * Runs twice weekly (Mon + Thu) via GitHub Actions. Produces 1-2 MDX articles per run.
 * Also runs daily in --security-only mode to publish urgent CVE alerts immediately.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'

const supabase = createAdminClient()
const blogDir = path.join(process.cwd(), 'content', 'blog')
const metaPath = path.join(blogDir, '.meta.json')

const CATEGORIES = [
  'productivity', 'developer-tools', 'data', 'finance', 'ai-ml',
  'communication', 'cloud', 'security', 'analytics', 'design',
  'devops', 'education', 'entertainment', 'health', 'marketing', 'other',
]

// ---------- Types ----------

interface ArticlePlan {
  type: 'weekly-roundup' | 'server-spotlight' | 'security-alert' | 'trending' | 'category-deep-dive'
  data: Record<string, unknown>
  prompt: string
}

interface Meta {
  lastRoundupDate: string | null
  lastSpotlightSlugs: string[]
  lastCategoryDeepDive: string | null
  lastCategoryDeepDiveDate: string | null
}

// ---------- Helpers ----------

function loadMeta(): Meta {
  const defaults: Meta = {
    lastRoundupDate: null,
    lastSpotlightSlugs: [],
    lastCategoryDeepDive: null,
    lastCategoryDeepDiveDate: null,
  }
  if (!fs.existsSync(metaPath)) return defaults
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) }
  } catch {
    return defaults
  }
}

function saveMeta(meta: Meta) {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
}

function getExistingPostDates(): string[] {
  if (!fs.existsSync(blogDir)) return []
  return fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.mdx'))
    .map(f => {
      const raw = fs.readFileSync(path.join(blogDir, f), 'utf-8')
      const { data } = matter(raw)
      return data.date as string
    })
    .filter(Boolean)
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text || ''
}

// ---------- Data Gathering ----------

async function getNewServers() {
  const { data } = await supabase
    .from('servers')
    .select('slug, name, tagline, categories, github_stars, score_total')
    .gte('created_at', daysAgo(7))
    .eq('is_archived', false)
    .order('score_total', { ascending: false })
    .limit(20)
  return data || []
}

async function getTrendingServers() {
  const { data } = await supabase
    .from('servers')
    .select('slug, name, tagline, github_stars, tags, score_total, categories')
    .eq('is_archived', false)
    .not('tags', 'is', null)
    .order('github_stars', { ascending: false })
    .limit(500)

  if (!data) return []

  return data
    .filter(s => s.tags?.some((t: string) => t.startsWith('trending:')))
    .map(s => {
      const trendTag = s.tags.find((t: string) => t.startsWith('trending:'))
      const gain = trendTag ? parseInt(trendTag.split(':')[1], 10) : 0
      return { ...s, starGain: gain }
    })
    .sort((a, b) => b.starGain - a.starGain)
    .slice(0, 15)
}

async function getSecurityAlerts() {
  const { data } = await supabase
    .from('security_advisories')
    .select('id, cve_id, severity, summary, published_at, server_id, servers(slug, name)')
    .gte('published_at', daysAgo(7))
    .in('severity', ['critical', 'high'])
    .order('published_at', { ascending: false })
    .limit(10)
  return data || []
}

async function getTopServersInCategory(category: string) {
  const { data } = await supabase
    .from('servers')
    .select('slug, name, tagline, description, categories, github_stars, score_total, tools, score_security, score_maintenance')
    .contains('categories', [category])
    .eq('is_archived', false)
    .order('score_total', { ascending: false })
    .limit(10)
  return data || []
}

async function getHighestScoredNewServer(excludeSlugs: string[]) {
  const { data } = await supabase
    .from('servers')
    .select('slug, name, tagline, description, categories, github_stars, score_total, tools, resources, prompts, score_security, score_maintenance, score_documentation, score_efficiency, score_compatibility, github_url, npm_package, pip_package')
    .gte('created_at', daysAgo(14))
    .eq('is_archived', false)
    .order('score_total', { ascending: false })
    .limit(20)

  if (!data) return null
  return data.find(s => !excludeSlugs.includes(s.slug)) || data[0] || null
}

async function getEcosystemStats() {
  const { count: totalServers } = await supabase
    .from('servers')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)

  const { count: newThisWeek } = await supabase
    .from('servers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', daysAgo(7))
    .eq('is_archived', false)

  return { totalServers: totalServers || 0, newThisWeek: newThisWeek || 0 }
}

// ---------- CLI Flags ----------

const securityOnly = process.argv.includes('--security-only')

// ---------- Article Planning ----------

async function planArticles(meta: Meta): Promise<ArticlePlan[]> {
  const plans: ArticlePlan[] = []
  const today = todayStr()
  const existingDates = getExistingPostDates()

  // Priority 1: Security alerts (always checked, even in security-only mode)
  const alerts = await getSecurityAlerts()
  if (alerts.length > 0) {
    plans.push({
      type: 'security-alert',
      data: { alerts },
      prompt: buildSecurityAlertPrompt(alerts),
    })
  }

  // In security-only mode, stop here — only publish if there are actual alerts
  if (securityOnly) return plans

  // Priority 2: Weekly roundup (once per week)
  const hasRoundupThisWeek = meta.lastRoundupDate && daysBetween(meta.lastRoundupDate, today) < 6
  if (!hasRoundupThisWeek) {
    const newServers = await getNewServers()
    const trending = await getTrendingServers()
    const stats = await getEcosystemStats()
    if (newServers.length > 0 || trending.length > 0) {
      plans.push({
        type: 'weekly-roundup',
        data: { newServers, trending, stats },
        prompt: buildWeeklyRoundupPrompt(newServers, trending, stats),
      })
    }
  }

  // Priority 3: Server spotlight
  if (plans.length < 2) {
    const spotlight = await getHighestScoredNewServer(meta.lastSpotlightSlugs)
    if (spotlight && spotlight.score_total > 30) {
      plans.push({
        type: 'server-spotlight',
        data: { server: spotlight },
        prompt: buildSpotlightPrompt(spotlight),
      })
    }
  }

  // Priority 4: Trending
  if (plans.length < 2) {
    const trending = await getTrendingServers()
    if (trending.length >= 5) {
      plans.push({
        type: 'trending',
        data: { trending },
        prompt: buildTrendingPrompt(trending),
      })
    }
  }

  // Priority 5: Category deep dive
  if (plans.length < 2) {
    const lastCategory = meta.lastCategoryDeepDive
    const candidates = CATEGORIES.filter(c => c !== lastCategory)
    const category = candidates[Math.floor(Math.random() * candidates.length)]
    const servers = await getTopServersInCategory(category)
    if (servers.length >= 3) {
      plans.push({
        type: 'category-deep-dive',
        data: { category, servers },
        prompt: buildCategoryDeepDivePrompt(category, servers),
      })
    }
  }

  // Return at most 2
  return plans.slice(0, 2)
}

function daysBetween(dateA: string, dateB: string): number {
  return Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) / (1000 * 60 * 60 * 24)
}

// ---------- Prompt Builders ----------

const SYSTEM_PROMPT = `You are a senior technical editor for MCPpedia, a catalog of MCP (Model Context Protocol) servers.
Write a blog post in MDX format (Markdown + JSX components). Do NOT include frontmatter — that's handled separately.

VOICE & TONE:
- Write like a sharp, opinionated editor — not a press release. Have a point of view.
- Short paragraphs (2-3 sentences max). Let the text breathe.
- Open with a hook that makes the reader care. No throat-clearing like "In this article..."
- Use bold for emphasis on key phrases. Use em dashes for asides.
- End with a strong closing line — a verdict, a call to action, or a provocation.

CUSTOM COMPONENTS (use these to break up walls of text):
- <PullQuote>A standout sentence that deserves emphasis</PullQuote> — use 1-2 per article for key insights
- <Callout type="tip|info|warning|fire">Important aside or highlight</Callout> — use for stats, warnings, or key takeaways
- <SectionLabel>Label text</SectionLabel> — centered divider label between major sections
- <ScoreBreakdown><ScoreRow label="Security" points="30" description="..." />...</ScoreBreakdown> — for score analysis
- <StatGrid><Stat value="150+" label="New Servers" detail="This week" />...</StatGrid> — for stat highlights
- IMPORTANT: All component props must be strings (points="30" not points={30})
- Use --- (horizontal rules) between major sections for visual breathing room

FORMATTING RULES:
- Every claim must be backed by the data provided. Do not invent features, stats, or capabilities.
- Use specific numbers: star counts, tool counts, scores, percentages.
- Link to MCPpedia server pages using [ServerName](/s/server-slug).
- Use ## for major sections, ### for subsections. Never use #.
- Numbered lists (### 1. Title) for ranked items or sequential trends.
- Bullet lists for feature lists and summaries.

Also return a JSON block at the very end of your response (after the article) with this exact format:
\`\`\`json
{"title": "Short punchy title under 80 chars", "description": "One sentence summary under 160 chars", "hook": "A provocative 1-2 sentence hook for social media sharing. Make it specific, surprising, or contrarian. Use real numbers. This is what people see on Twitter/LinkedIn — make them click."}
\`\`\``

function buildWeeklyRoundupPrompt(newServers: unknown[], trending: unknown[], stats: Record<string, unknown>): string {
  return `Write a WEEKLY ROUNDUP article (800-1200 words) about what happened in the MCP ecosystem this week.

ECOSYSTEM STATS:
${JSON.stringify(stats, null, 2)}

NEW SERVERS THIS WEEK (${newServers.length} total):
${JSON.stringify(newServers.slice(0, 10), null, 2)}

TRENDING SERVERS (by star gain):
${JSON.stringify(trending.slice(0, 10), null, 2)}

Write the article now. Highlight the most interesting 3-5 new servers and top trending projects. Include ecosystem stats in the intro.`
}

function buildSpotlightPrompt(server: Record<string, unknown>): string {
  return `Write a SERVER SPOTLIGHT article (600-1000 words) about this MCP server.

SERVER DATA:
${JSON.stringify(server, null, 2)}

Write the article now. Cover: what the server does, its tools/capabilities, quality scores, and who would benefit from using it. Be specific about the tools available and link to the server page.`
}

function buildSecurityAlertPrompt(alerts: unknown[]): string {
  return `Write a SECURITY ALERT article (400-600 words) about recent security advisories affecting MCP servers.

SECURITY ADVISORIES:
${JSON.stringify(alerts, null, 2)}

Write the article now. For each advisory, explain the severity, what's affected, and what users should do. Link to affected server pages on MCPpedia.`
}

function buildTrendingPrompt(trending: unknown[]): string {
  return `Write a TRENDING article (600-1000 words) about the MCP servers gaining the most stars this week.

TRENDING SERVERS:
${JSON.stringify(trending.slice(0, 10), null, 2)}

Write the article now. Analyze what these servers have in common, why they might be gaining attention, and highlight the top 5 with specific details.`
}

function buildCategoryDeepDivePrompt(category: string, servers: unknown[]): string {
  return `Write a CATEGORY DEEP DIVE article (800-1200 words) about MCP servers in the "${category}" category.

TOP SERVERS IN THIS CATEGORY:
${JSON.stringify(servers, null, 2)}

Write the article now. Give an overview of the category, compare the top servers (scores, tools, maintenance), and recommend which to use for different needs. Be opinionated — pick clear winners where the data supports it.`
}

// ---------- Article Generation ----------

async function generateArticle(plan: ArticlePlan): Promise<{ slug: string; content: string; featuredServers: string[] } | null> {
  console.log(`  Generating ${plan.type} article...`)

  const response = await callClaude(SYSTEM_PROMPT, plan.prompt)

  // Extract title/description JSON from the end
  const jsonMatch = response.match(/```json\s*\n?(\{[\s\S]*?\})\s*\n?```/)
  let title = `MCP Ecosystem Update — ${todayStr()}`
  let description = 'Latest updates from the MCP ecosystem.'
  let hook = ''

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      title = parsed.title || title
      description = parsed.description || description
      hook = parsed.hook || ''
    } catch { /* use defaults */ }
  }

  // Remove the JSON block from the article body
  const articleBody = response.replace(/```json\s*\n?\{[\s\S]*?\}\s*\n?```/, '').trim()

  if (articleBody.length < 200) {
    console.error('  Article too short, skipping')
    return null
  }

  // Extract featured server slugs from data
  const featuredServers = extractServerSlugs(plan.data)

  const slug = `${todayStr()}-${toSlug(title)}`

  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    `hook: "${hook.replace(/"/g, '\\"')}"`,
    `date: "${todayStr()}"`,
    `tags: ${JSON.stringify(getTagsForType(plan.type))}`,
    `category: "${plan.type}"`,
    `featuredServers: ${JSON.stringify(featuredServers.slice(0, 10))}`,
    '---',
    '',
  ].join('\n')

  return { slug, content: frontmatter + articleBody + '\n', featuredServers }
}

function extractServerSlugs(data: Record<string, unknown>): string[] {
  const slugs: string[] = []
  const extract = (obj: unknown) => {
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (item && typeof item === 'object' && 'slug' in item) {
          slugs.push(item.slug as string)
        }
      })
    } else if (obj && typeof obj === 'object' && 'slug' in obj) {
      slugs.push((obj as Record<string, unknown>).slug as string)
    }
  }
  Object.values(data).forEach(extract)
  return [...new Set(slugs)]
}

function getTagsForType(type: string): string[] {
  const tagMap: Record<string, string[]> = {
    'weekly-roundup': ['weekly', 'ecosystem', 'new-servers'],
    'server-spotlight': ['spotlight', 'review'],
    'security-alert': ['security', 'cve', 'advisory'],
    'trending': ['trending', 'stars', 'popular'],
    'category-deep-dive': ['deep-dive', 'comparison', 'guide'],
  }
  return tagMap[type] || ['mcp']
}

// ---------- Main ----------

async function main() {
  console.log(`=== MCPpedia Blog Generator${securityOnly ? ' (security-only)' : ''} ===`)
  console.log(new Date().toISOString())

  // Ensure blog directory exists
  if (!fs.existsSync(blogDir)) {
    fs.mkdirSync(blogDir, { recursive: true })
  }

  const run = await BotRun.start('generate-blog')

  try {
    const meta = loadMeta()
    const plans = await planArticles(meta)

    if (plans.length === 0) {
      console.log('No articles to generate — insufficient data this week.')
      run.setSummary({ reason: 'insufficient data' })
      await run.finish()
      return
    }

    console.log(`Planning ${plans.length} article(s): ${plans.map(p => p.type).join(', ')}`)
    run.addProcessed(plans.length)

    for (const plan of plans) {
      const result = await generateArticle(plan)
      if (!result) continue

      const filePath = path.join(blogDir, `${result.slug}.mdx`)
      fs.writeFileSync(filePath, result.content)
      console.log(`  Written: ${result.slug}.mdx`)
      run.addUpdated(1)

      // Update meta
      if (plan.type === 'weekly-roundup') {
        meta.lastRoundupDate = todayStr()
      }
      if (plan.type === 'server-spotlight' && result.featuredServers.length > 0) {
        meta.lastSpotlightSlugs = [
          ...result.featuredServers.slice(0, 3),
          ...meta.lastSpotlightSlugs.slice(0, 7),
        ]
      }
      if (plan.type === 'category-deep-dive') {
        meta.lastCategoryDeepDive = (plan.data.category as string) || null
        meta.lastCategoryDeepDiveDate = todayStr()
      }

      // Rate limit between articles
      await new Promise(r => setTimeout(r, 2000))
    }

    saveMeta(meta)
    run.setSummary({ articles: plans.map(p => p.type) })
    await run.finish()
    console.log('\nDone.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Failed:', msg)
    await run.fail(msg)
    process.exit(1)
  }
}

main().catch(console.error)
