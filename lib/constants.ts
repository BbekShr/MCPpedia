export const CATEGORIES = [
  'productivity',
  'developer-tools',
  'data',
  'finance',
  'ai-ml',
  'communication',
  'cloud',
  'security',
  'analytics',
  'design',
  'devops',
  'education',
  'entertainment',
  'health',
  'marketing',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  'productivity': 'Productivity',
  'developer-tools': 'Developer Tools',
  'data': 'Data',
  'finance': 'Finance',
  'ai-ml': 'AI / ML',
  'communication': 'Communication',
  'cloud': 'Cloud',
  'security': 'Security',
  'analytics': 'Analytics',
  'design': 'Design',
  'devops': 'DevOps',
  'education': 'Education',
  'entertainment': 'Entertainment',
  'health': 'Health',
  'marketing': 'Marketing',
  'other': 'Other',
}

export const TRANSPORTS = ['stdio', 'sse', 'http'] as const
export type Transport = (typeof TRANSPORTS)[number]

export const HEALTH_STATUSES = ['active', 'maintained', 'stale', 'abandoned', 'archived', 'unknown'] as const
export type HealthStatus = (typeof HEALTH_STATUSES)[number]

export const HEALTH_THRESHOLDS = {
  active: 30,       // days since last commit
  maintained: 90,
  stale: 365,
  // abandoned: > 365
} as const

export const API_PRICING_OPTIONS = ['free', 'freemium', 'paid', 'unknown'] as const
export type ApiPricing = (typeof API_PRICING_OPTIONS)[number]

export const AUTHOR_TYPES = ['official', 'community', 'unknown'] as const
export type AuthorType = (typeof AUTHOR_TYPES)[number]

export const USER_ROLES = ['contributor', 'editor', 'maintainer', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const COMPATIBLE_CLIENTS = ['claude-desktop', 'cursor', 'claude-code', 'windsurf', 'other'] as const
export type CompatibleClient = (typeof COMPATIBLE_CLIENTS)[number]

export const CLIENT_LABELS: Record<CompatibleClient, string> = {
  'claude-desktop': 'Claude Desktop',
  'cursor': 'Cursor',
  'claude-code': 'Claude Code',
  'windsurf': 'Windsurf',
  'other': 'Other',
}

export const ITEMS_PER_PAGE = 20
export const REVALIDATE_LISTINGS = 60       // seconds
export const REVALIDATE_GUIDES = 86400      // 24 hours

export const SITE_NAME = 'MCPpedia'
export const SITE_DESCRIPTION = 'The free, open, community-driven encyclopedia for MCP servers.'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'
