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
  'search',
  'writing',
  'maps',
  'ecommerce',
  'legal',
  'browser',
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
  'search': 'Search',
  'writing': 'Writing',
  'maps': 'Maps & Geo',
  'ecommerce': 'E-Commerce',
  'legal': 'Legal',
  'browser': 'Browser',
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
export const SITE_DESCRIPTION = 'Discover and compare 17,000+ MCP servers — each scored on security, maintenance, and efficiency with real CVE scanning. Find the right server before you install.'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'

// Public fields safe to expose in API responses (excludes internal scoring details, scan internals, claimed_by, etc.)
export const PUBLIC_SERVER_FIELDS = [
  'id', 'slug', 'name', 'tagline', 'description',
  'github_url', 'npm_package', 'pip_package', 'homepage_url',
  'license', 'author_name', 'author_github', 'author_type',
  'transport', 'compatible_clients', 'install_configs',
  'tools', 'resources', 'prompts',
  'api_name', 'api_pricing', 'api_rate_limits', 'requires_api_key',
  'github_stars', 'github_last_commit', 'github_open_issues', 'npm_weekly_downloads',
  'is_archived', 'health_status', 'health_checked_at',
  'categories', 'tags', 'source', 'verified',
  'created_at', 'updated_at',
  'score_total', 'score_security', 'score_maintenance',
  'score_documentation', 'score_compatibility', 'score_efficiency', 'score_computed_at',
  'has_authentication', 'cve_count', 'security_evidence',
  'has_tool_poisoning', 'tool_poisoning_flags', 'tool_definition_hash',
  'total_tool_tokens', 'estimated_tokens_per_call', 'token_efficiency_grade',
  'doc_readme_quality', 'doc_has_setup', 'doc_has_examples', 'doc_tool_schema_ratio',
  'env_instructions', 'prerequisites',
  'last_health_check_status', 'last_health_check_at', 'health_check_uptime',
  'publisher_verified', 'review_count', 'review_avg',
  'community_verification_count', 'community_verified',
].join(', ')
