/**
 * Skills Scanner — finds new Claude Code skills/plugins on GitHub and appends
 * them to data/skills.json. Runs weekly via GitHub Actions.
 *
 * Every candidate must clear two bars before it's added:
 * 1. Heuristic filters (not a fork/archived, minimum stars, pushed recently) —
 *    cheap, run against the repo-search results directly.
 * 2. A concrete check that the repo actually ships a SKILL.md — a repo search
 *    hit only means "skill" showed up in a topic/name/description, which is
 *    not the same as being a skill.
 *
 * This keeps the /skills page's "checked against concrete criteria, not just
 * scraped listings" claim true for bot-added entries the same way it's true
 * for hand-added ones.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'node:fs'
import path from 'node:path'
import { BotRun } from './lib/bot-run'
import { searchRepos, repoHasFile, type GitHubRepo } from './lib/github'
import { humanizeServerName } from '../lib/server-name'
import { SKILL_CATEGORIES, type Skill, type SkillCategory } from '../lib/skills'

const DATA_PATH = path.join(__dirname, '..', 'data', 'skills.json')

// Keep each run's blast radius small — this feeds a curated page, not a bulk
// catalog, and a bad heuristic match should cost a handful of rows, not fifty.
const MAX_NEW_PER_RUN = 8
const MIN_STARS = 3
const MAX_AGE_DAYS = 548 // ~18 months since last push — "not abandoned"

const FALSE_POSITIVE_KEYWORDS = [
  'minecraft', 'skill tree', 'rpg game', 'game engine', 'unity3d', 'unreal engine',
  'd&d', 'dnd 5e', 'tabletop',
]

const SEARCH_QUERIES = [
  'topic:claude-skills',
  'topic:claude-code-skills',
  'topic:claude-skill',
  'topic:agent-skills',
  'topic:claude-plugins',
  '"claude code skill" in:name,description',
  '"claude skills" in:name,description',
  '"SKILL.md" in:readme',
  'claude-skills in:name',
  'claude-skill in:name',
]

const CATEGORY_KEYWORDS: Record<SkillCategory, string[]> = {
  'development-workflow': ['workflow', 'git worktree', 'ci/cd', 'devops', 'coding agent', 'refactor', 'debug', 'code review'],
  'testing': ['test', 'qa ', 'playwright', 'selenium', 'e2e', 'quality assurance'],
  'design': ['design', ' ui ', ' ux ', 'figma', 'frontend', 'css', 'illustration', 'visual'],
  'data': ['data', 'sql', 'database', 'aws', 'analytics', 'spreadsheet', 'excel', 'csv'],
  'writing': ['writing', 'content', 'blog', 'copywriting', 'documentation', 'docx'],
  'research': ['research', 'science', 'academic', 'literature review'],
  'product': ['product manager', 'roadmap', 'product planning', 'startup'],
  'marketing': ['marketing', 'seo', 'growth hacking', 'ad campaign'],
  'meta': ['skill-creator', 'skill creator', 'skill factory', 'skill builder'],
  'other': [],
}

function inferCategory(name: string, description: string, topics: string[]): SkillCategory {
  const hay = ` ${name} ${description} ${topics.join(' ')} `.toLowerCase()
  if (/\bawesome\b|marketplace|curated list/.test(hay)) return 'meta'
  for (const category of SKILL_CATEGORIES) {
    if (category === 'other') continue
    if (CATEGORY_KEYWORDS[category].some(kw => hay.includes(kw))) return category
  }
  return 'other'
}

function slugForRepo(owner: string, name: string): string {
  const base = owner.toLowerCase() === 'anthropics' ? `anthropic-${name}` : name
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

/** data/skills.json keeps `tags`/`compatible_with` as one-line arrays and only
 *  breaks `install` across lines — plain `JSON.stringify(arr, null, 2)`
 *  ignores that and reformats every array multi-line, which would turn a
 *  handful of new rows into a thousand-line diff against the existing file.
 *  Mirror the file's own style instead of reformatting it. */
function stringifySkills(skills: Skill[]): string {
  const objLines = skills.map((skill, i) => {
    const keys = Object.keys(skill) as (keyof Skill)[]
    const fieldLines = keys.map((key, ki) => {
      const value = skill[key]
      const comma = ki === keys.length - 1 ? '' : ','
      let rendered: string
      if (Array.isArray(value)) {
        rendered = `[${value.map(v => JSON.stringify(v)).join(', ')}]`
      } else if (value !== null && typeof value === 'object') {
        const innerKeys = Object.keys(value)
        const innerLines = innerKeys.map((ik, iki) => {
          const innerComma = iki === innerKeys.length - 1 ? '' : ','
          return `      ${JSON.stringify(ik)}: ${JSON.stringify((value as Record<string, unknown>)[ik])}${innerComma}`
        })
        rendered = `{\n${innerLines.join('\n')}\n    }`
      } else {
        rendered = JSON.stringify(value)
      }
      return `    ${JSON.stringify(key)}: ${rendered}${comma}`
    })
    const closer = i === skills.length - 1 ? '  }' : '  },'
    return `  {\n${fieldLines.join('\n')}\n${closer}`
  })
  return `[\n${objLines.join('\n')}\n]\n`
}

interface Existing {
  skills: Skill[]
  repos: Set<string>
  slugs: Set<string>
}

function loadExisting(): Existing {
  const raw = fs.readFileSync(DATA_PATH, 'utf8')
  const skills = JSON.parse(raw) as Skill[]
  return {
    skills,
    repos: new Set(skills.map(s => s.repo.toLowerCase())),
    slugs: new Set(skills.map(s => s.slug)),
  }
}

function passesHeuristics(repo: GitHubRepo, existingRepos: Set<string>): boolean {
  if (existingRepos.has(repo.full_name.toLowerCase())) return false
  if (repo.fork || repo.archived) return false
  if (repo.stargazers_count < MIN_STARS) return false
  const ageMs = Date.now() - new Date(repo.pushed_at).getTime()
  if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return false
  const hay = `${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')}`.toLowerCase()
  if (FALSE_POSITIVE_KEYWORDS.some(kw => hay.includes(kw))) return false
  // The search queries above are keyword/topic matches on GitHub's side, which
  // is loose enough to surface totally unrelated popular repos (observed:
  // prisma/orm, firecrawl/firecrawl, punkpeye/awesome-mcp-servers — none of
  // which mention Claude skills at all). Require "claude" AND "skill" to both
  // actually appear before a repo is even considered a candidate; the SKILL.md
  // check below only confirms the winners, it doesn't filter the pool.
  if (!hay.includes('claude') || !hay.includes('skill')) return false
  return true
}

async function main() {
  const run = await BotRun.start('scan-skills')
  try {
    console.log('=== MCPpedia Skills Scanner ===')
    console.log(new Date().toISOString())

    const existing = loadExisting()
    const candidates = new Map<string, GitHubRepo>()

    for (const query of SEARCH_QUERIES) {
      try {
        const repos = await searchRepos(query, 50)
        for (const r of repos) candidates.set(r.full_name.toLowerCase(), r)
        console.log(`  "${query}" → ${repos.length} results (total unique: ${candidates.size})`)
      } catch (err) {
        console.error(`  Error searching "${query}": ${err}`)
      }
      await new Promise(r => setTimeout(r, 2500)) // stay under repo-search rate limits
    }
    run.addProcessed(candidates.size)

    const passed = Array.from(candidates.values())
      .filter(repo => passesHeuristics(repo, existing.repos))
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
    console.log(`\n${candidates.size} candidates → ${passed.length} pass heuristic filters`)

    const added: Skill[] = []
    for (const repo of passed) {
      if (added.length >= MAX_NEW_PER_RUN) break

      const [owner, name] = repo.full_name.split('/')
      const hasSkillFile = await repoHasFile(owner, name, 'SKILL.md')
      await new Promise(r => setTimeout(r, 7000)) // code search: 10 req/min authenticated
      if (!hasSkillFile) {
        console.log(`  skip ${repo.full_name} — no SKILL.md found`)
        continue
      }

      const slug = uniqueSlug(slugForRepo(owner, name), existing.slugs)
      const category = inferCategory(name, repo.description || '', repo.topics)
      const skill: Skill = {
        slug,
        name: humanizeServerName(name),
        tagline: (repo.description || 'A Claude Code skill.').slice(0, 200),
        repo: repo.full_name,
        github_url: repo.html_url,
        ...(repo.homepage ? { homepage_url: repo.homepage } : {}),
        author: owner,
        author_type: owner.toLowerCase() === 'anthropics' ? 'official' : 'community',
        license: repo.license?.spdx_id ?? null,
        stars: repo.stargazers_count,
        last_updated: toDateOnly(repo.pushed_at),
        category,
        tags: repo.topics.slice(0, 6),
        compatible_with: ['claude-code'],
        type: 'skill',
        install: {
          manual: `Clone ${repo.full_name} and copy its skill folder(s) into your .claude/skills/ directory — see the repo README for details.`,
        },
      }

      existing.skills.push(skill)
      existing.slugs.add(slug)
      existing.repos.add(repo.full_name.toLowerCase())
      added.push(skill)
      run.addUpdated()
      console.log(`  + ${slug} (${repo.stargazers_count}★, ${category})`)
    }

    if (added.length > 0) {
      fs.writeFileSync(DATA_PATH, stringifySkills(existing.skills))
    }

    run.setSummary({
      candidates: candidates.size,
      passed_filters: passed.length,
      added: added.length,
      added_slugs: added.map(s => s.slug),
    })
    console.log(`\nDone. Added ${added.length} new skill(s).`)
    await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
