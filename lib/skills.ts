// Skills data model — static, hand-curated for now.
// Promoted to DB/bot-driven later if the feature earns traffic.
import skillsData from '@/data/skills.json'

export const SKILL_CATEGORIES = [
  'development-workflow',
  'testing',
  'design',
  'data',
  'writing',
  'research',
  'product',
  'marketing',
  'meta',
  'other',
] as const

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  'development-workflow': 'Development Workflow',
  'testing': 'Testing & Debugging',
  'design': 'Design & Frontend',
  'data': 'Data & Documents',
  'writing': 'Writing & Content',
  'research': 'Research & Analysis',
  'product': 'Product & Planning',
  'marketing': 'Marketing & SEO',
  'meta': 'Meta & Skill-Building',
  'other': 'Other',
}

export const SKILL_CATEGORY_ICONS: Record<SkillCategory, string> = {
  'development-workflow': '⚙',
  'testing': '🧪',
  'design': '🎨',
  'data': '📊',
  'writing': '✍',
  'research': '🔬',
  'product': '🧭',
  'marketing': '📣',
  'meta': '🧩',
  'other': '📦',
}

export const SKILL_COMPATIBLE_AGENTS = [
  'claude-code',
  'claude-desktop',
  'codex',
  'cursor',
  'gemini-cli',
  'copilot-cli',
  'opencode',
] as const

export type SkillAgent = (typeof SKILL_COMPATIBLE_AGENTS)[number]

export const SKILL_AGENT_LABELS: Record<SkillAgent, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  'codex': 'Codex CLI',
  'cursor': 'Cursor',
  'gemini-cli': 'Gemini CLI',
  'copilot-cli': 'Copilot CLI',
  'opencode': 'OpenCode',
}

export type SkillType = 'plugin' | 'skill-collection' | 'skill' | 'marketplace'

export interface Skill {
  slug: string
  name: string
  tagline: string
  description?: string
  repo: string
  github_url: string
  homepage_url?: string
  author: string
  author_type: 'official' | 'community'
  license: string | null
  stars: number
  last_updated?: string
  category: SkillCategory
  tags: string[]
  compatible_with: SkillAgent[]
  type: SkillType
  featured?: boolean
  install: {
    claude_code?: string
    codex?: string
    cursor?: string
    gemini?: string
    manual?: string
  }
}

const skills = skillsData as Skill[]

export function getAllSkills(): Skill[] {
  return [...skills].sort((a, b) => {
    // Featured first, then official, then by stars desc
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    if (a.author_type === 'official' && b.author_type !== 'official') return -1
    if (a.author_type !== 'official' && b.author_type === 'official') return 1
    return (b.stars || 0) - (a.stars || 0)
  })
}

export function getSkill(slug: string): Skill | undefined {
  return skills.find(s => s.slug === slug)
}

export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return getAllSkills().filter(s => s.category === category)
}

export function getFeaturedSkills(limit = 6): Skill[] {
  return getAllSkills().filter(s => s.featured).slice(0, limit)
}

export function getSkillCategoriesWithCounts(): { category: SkillCategory; count: number }[] {
  const counts = new Map<SkillCategory, number>()
  for (const s of skills) {
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1)
  }
  return SKILL_CATEGORIES
    .map(category => ({ category, count: counts.get(category) ?? 0 }))
    .filter(c => c.count > 0)
}
