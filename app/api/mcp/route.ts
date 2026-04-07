import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

// Fields per action — only fetch what's needed
const SEARCH_FIELDS = [
  'slug', 'name', 'tagline', 'score_total', 'score_security', 'score_maintenance',
  'score_efficiency', 'score_documentation', 'score_compatibility',
  'github_stars', 'npm_weekly_downloads', 'token_efficiency_grade',
  'health_status', 'categories', 'author_type', 'cve_count', 'transport',
].join(', ')

const DETAIL_FIELDS = [
  'slug', 'name', 'tagline', 'description',
  'github_url', 'npm_package', 'pip_package', 'homepage_url',
  'license', 'author_name', 'author_github', 'author_type',
  'transport', 'compatible_clients', 'install_configs',
  'tools', 'resources', 'prompts',
  'api_name', 'api_pricing', 'api_rate_limits', 'requires_api_key',
  'github_stars', 'github_last_commit', 'github_open_issues', 'npm_weekly_downloads',
  'is_archived', 'health_status', 'categories', 'tags', 'verified',
  'score_total', 'score_security', 'score_maintenance',
  'score_documentation', 'score_compatibility', 'score_efficiency', 'score_computed_at',
  'has_authentication', 'cve_count', 'security_evidence',
  'has_tool_poisoning', 'tool_poisoning_flags',
  'total_tool_tokens', 'estimated_tokens_per_call', 'token_efficiency_grade',
  'doc_readme_quality', 'doc_has_setup', 'doc_has_examples',
  'env_instructions', 'prerequisites',
  'publisher_verified', 'community_verified', 'review_count', 'review_avg',
].join(', ')

const SECURITY_FIELDS = [
  'slug', 'name', 'score_security', 'cve_count',
  'has_authentication', 'has_tool_poisoning', 'tool_poisoning_flags',
  'has_code_execution', 'has_injection_risk', 'dangerous_pattern_count',
  'dep_health_score', 'security_evidence', 'license',
  'is_archived', 'verified', 'security_verified', 'publisher_verified',
].join(', ')

const INSTALL_FIELDS = [
  'slug', 'name', 'install_configs', 'compatible_clients',
  'transport', 'npm_package', 'pip_package',
  'env_instructions', 'prerequisites', 'requires_api_key',
].join(', ')

const ALLOWED_CATEGORIES = new Set([
  'productivity', 'developer-tools', 'data', 'finance', 'ai-ml',
  'communication', 'cloud', 'security', 'analytics', 'design',
  'devops', 'education', 'entertainment', 'health', 'marketing',
  'search', 'writing', 'maps', 'ecommerce', 'legal', 'browser', 'other',
])

const ALLOWED_SORTS = new Set(['score', 'stars', 'newest'])

// Sanitize user input for use in Supabase .or() filters — strip anything that could inject filter syntax
function sanitizeQuery(input: string): string {
  // Only allow alphanumeric, spaces, hyphens, and basic punctuation
  return input.replace(/[^a-zA-Z0-9 \-_.]/g, '').slice(0, 200)
}

// Validate slug: only lowercase alphanumeric, hyphens, dots, underscores
function isValidSlug(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && s.length <= 200 && /^[a-z0-9\-_.]+$/.test(s)
}

// Safe integer parser
function safeInt(val: unknown, fallback: number, min: number, max: number): number {
  const n = Number(val)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

// Rate limit by IP — ignore x-forwarded-for (use Vercel's own header or fallback)
function getClientIp(req: Request): string {
  // Vercel sets x-real-ip which can't be spoofed by the client
  return req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  // Everyone gets the same rate limit — no fake API key bypass
  // Future: validate real API keys against a database table
  const rl = checkRateLimit(`mcp:${ip}`, 60, 60_000)

  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limited', retryAfter: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
    )
  }

  let body: { action: string; params: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, params } = body
  if (!action || typeof action !== 'string') {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    switch (action) {
      case 'search': {
        const rawQuery = String(params.query || '')
        const query = sanitizeQuery(rawQuery)
        if (!query) {
          return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
        }

        const category = typeof params.category === 'string' ? params.category : undefined
        if (category && !ALLOWED_CATEGORIES.has(category)) {
          return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
        }

        const minScore = safeInt(params.min_score, 0, 0, 100) || undefined
        const limit = safeInt(params.limit, 5, 1, 20)

        // Try FTS first
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_servers', {
          search_query: query,
          category_filter: category || null,
          status_filter: null,
          pricing_filter: null,
          sort_by: 'relevance',
          page_size: limit,
          page_offset: 0,
        })

        let servers = rpcData

        // Fallback to basic query if RPC fails
        if (rpcError || !servers?.length) {
          let q = supabase
            .from('servers')
            .select(SEARCH_FIELDS)
            .eq('is_archived', false)
            .order('score_total', { ascending: false })
            .limit(limit)

          if (category) q = q.contains('categories', [category])
          if (minScore) q = q.gte('score_total', minScore)

          // Safe: query is sanitized (alphanumeric only), no filter injection possible
          q = q.or(`name.ilike.%${query}%,tagline.ilike.%${query}%`)

          const { data } = await q
          servers = data
        }

        if (minScore && servers) {
          servers = servers.filter((s: Record<string, unknown>) => (s.score_total as number) >= minScore)
        }

        return NextResponse.json({ data: servers || [] }, {
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
        })
      }

      case 'details': {
        const slug = String(params.slug || '')
        if (!isValidSlug(slug)) {
          return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
        }
        const { data, error } = await supabase
          .from('servers')
          .select(DETAIL_FIELDS)
          .eq('slug', slug)
          .single()

        if (error || !data) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        return NextResponse.json({ data }, {
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
        })
      }

      case 'security': {
        const slug = String(params.slug || '')
        if (!isValidSlug(slug)) {
          return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
        }
        const { data, error } = await supabase
          .from('servers')
          .select(SECURITY_FIELDS)
          .eq('slug', slug)
          .single()

        if (error || !data) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        return NextResponse.json({ data }, {
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
        })
      }

      case 'compare': {
        const slugs = params.slugs
        if (!Array.isArray(slugs) || slugs.length < 2 || slugs.length > 5) {
          return NextResponse.json({ error: 'Provide 2-5 slugs' }, { status: 400 })
        }
        if (!slugs.every(s => isValidSlug(s))) {
          return NextResponse.json({ error: 'Invalid slug in array' }, { status: 400 })
        }
        const { data, error } = await supabase
          .from('servers')
          .select(SEARCH_FIELDS)
          .in('slug', slugs)

        if (error || !data?.length) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        return NextResponse.json({ data }, {
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
        })
      }

      case 'install': {
        const slug = String(params.slug || '')
        if (!isValidSlug(slug)) {
          return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
        }
        const { data, error } = await supabase
          .from('servers')
          .select(INSTALL_FIELDS)
          .eq('slug', slug)
          .single()

        if (error || !data) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        return NextResponse.json({ data }, {
          headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
        })
      }

      case 'trending': {
        const category = typeof params.category === 'string' ? params.category : undefined
        if (category && !ALLOWED_CATEGORIES.has(category)) {
          return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
        }

        const sortBy = typeof params.sort === 'string' && ALLOWED_SORTS.has(params.sort)
          ? params.sort
          : 'score'
        const limit = safeInt(params.limit, 10, 1, 20)

        let q = supabase
          .from('servers')
          .select(SEARCH_FIELDS)
          .eq('is_archived', false)
          .gt('score_total', 0)

        if (category) q = q.contains('categories', [category])

        switch (sortBy) {
          case 'stars':
            q = q.order('github_stars', { ascending: false })
            break
          case 'newest':
            q = q.order('created_at', { ascending: false })
            break
          default:
            q = q.order('score_total', { ascending: false })
        }

        const { data } = await q.limit(limit)
        return NextResponse.json({ data: data || [] }, {
          headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
