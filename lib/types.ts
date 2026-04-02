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
