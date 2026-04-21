export interface Server {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  github_url: string | null
  npm_package: string | null
  pip_package: string | null
  homepage_url: string | null
  license: string | null
  author_name: string | null
  author_github: string | null
  author_type: 'official' | 'community' | 'unknown'
  transport: string[]
  compatible_clients: string[]
  install_configs: Record<string, unknown>
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  api_name: string | null
  api_pricing: 'free' | 'freemium' | 'paid' | 'unknown'
  api_rate_limits: string | null
  requires_api_key: boolean
  github_stars: number
  github_last_commit: string | null
  github_open_issues: number
  npm_weekly_downloads: number
  is_archived: boolean
  health_status: 'active' | 'maintained' | 'stale' | 'abandoned' | 'archived' | 'unknown'
  health_checked_at: string | null
  categories: string[]
  tags: string[]
  source: 'manual' | 'bot-github' | 'bot-npm' | 'bot-pypi' | 'import'
  submitted_by: string | null
  verified: boolean
  created_at: string
  updated_at: string
  // MCPpedia Score
  score_total: number
  score_security: number
  score_maintenance: number
  score_documentation: number
  score_compatibility: number
  score_efficiency: number
  score_computed_at: string | null
  // Security
  has_authentication: boolean
  security_issues: SecurityIssue[]
  security_evidence: SecurityEvidence[]
  cve_count: number
  last_security_scan: string | null
  security_scan_status: 'success' | 'failed' | 'pending'
  security_verified: boolean
  has_code_execution: boolean
  has_injection_risk: boolean
  dangerous_pattern_count: number
  dep_health_score: number | null
  dependency_count: number | null
  // Tool poisoning detection
  has_tool_poisoning: boolean
  tool_poisoning_flags: string[]
  tool_definition_hash: string | null
  // Token efficiency
  estimated_tokens_per_call: number
  total_tool_tokens: number
  token_efficiency_grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'unknown'
  // Documentation evidence
  doc_readme_quality: 'excellent' | 'good' | 'basic' | 'poor' | 'none' | null
  doc_has_setup: boolean
  doc_has_examples: boolean
  doc_tool_schema_ratio: number | null
  // Registry
  registry_id: string | null
  registry_synced_at: string | null
  registry_verified: boolean
  // Data quality
  data_quality: number
  // Env instructions
  env_instructions: Record<string, { label: string; url: string; steps: string }>
  prerequisites: string[]
  // Health checks
  last_health_check_status: string | null
  last_health_check_at: string | null
  health_check_uptime: number
  // Publisher
  claimed_by: string | null
  publisher_verified: boolean
  // Reviews
  review_count: number
  review_avg: number
  // Community verification
  community_verification_count: number
  community_verified: boolean
}

export interface SecurityEvidence {
  id: string
  label: string
  pass: boolean | null
  detail: string
  points: number
  max_points: number
  link?: string
  link_text?: string
}

export interface SecurityIssue {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
}

export interface SecurityAdvisory {
  id: string
  server_id: string
  cve_id: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  cvss_score: number | null
  title: string
  description: string | null
  affected_versions: string | null
  fixed_version: string | null
  source_url: string | null
  status: 'open' | 'fixed' | 'wont_fix' | 'disputed'
  published_at: string | null
  created_at: string
}

export interface Comparison {
  id: string
  server_a_id: string
  server_b_id: string
  slug: string
  summary: string | null
  winner_id: string | null
  view_count: number
  created_at: string
  updated_at: string
  server_a?: Server
  server_b?: Server
}

export interface Tool {
  name: string
  description: string
  input_schema?: Record<string, unknown>
}

export interface Resource {
  name: string
  description: string
  uri_template?: string
}

export interface Prompt {
  name: string
  description: string
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  github_username: string | null
  bio: string | null
  servers_submitted: number
  edits_approved: number
  discussions_count: number
  karma: number
  role: 'contributor' | 'editor' | 'maintainer' | 'admin'
  created_at: string
}

export interface Edit {
  id: string
  server_id: string
  user_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  edit_reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  // Joined
  profile?: Profile
  server?: Pick<Server, 'name' | 'slug'>
}

export interface Discussion {
  id: string
  server_id: string
  user_id: string
  parent_id: string | null
  body: string
  upvotes: number
  created_at: string
  updated_at: string
  // Joined
  profile?: Profile
  replies?: Discussion[]
}

export interface Changelog {
  id: string
  server_id: string
  version: string | null
  changes_summary: string | null
  detected_at: string
  github_release_url: string | null
}

export interface Flag {
  id: string
  user_id: string
  target_type: 'server' | 'discussion' | 'edit'
  target_id: string
  reason: string
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
}

export interface Vote {
  user_id: string
  discussion_id: string
  value: 1 | -1
}
