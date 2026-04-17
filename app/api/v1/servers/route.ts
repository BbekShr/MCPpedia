import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeSearchQuery } from '@/lib/validators'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

/**
 * Public API: GET /api/v1/servers
 *
 * Query parameters:
 *   q          - Full-text search query
 *   category   - Filter by category (e.g., "developer-tools", "productivity")
 *   status     - Filter by health status (active, maintained, stale, abandoned)
 *   transport  - Filter by transport (stdio, sse, http)
 *   min_score  - Minimum MCPpedia score (0-100)
 *   sort       - Sort by: score (default), stars, downloads, newest, name
 *   limit      - Results per page (max 100, default 20)
 *   offset     - Pagination offset (default 0)
 *
 * Response: { servers: [...], total: number, limit: number, offset: number }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') || ''
  const category = searchParams.get('category') || ''
  const status = searchParams.get('status') || ''
  const transport = searchParams.get('transport') || ''
  const minScore = parseInt(searchParams.get('min_score') || '0', 10)
  const sort = searchParams.get('sort') || 'score'
  const limit = Math.min(parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10), MAX_LIMIT)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const supabase = await createClient()

  // Select only public-safe fields
  const fields = [
    'slug', 'name', 'tagline', 'description',
    'github_url', 'npm_package', 'pip_package', 'homepage_url',
    'license', 'author_name', 'author_github', 'author_type',
    'transport', 'compatible_clients', 'install_configs',
    'categories', 'tags',
    'github_stars', 'github_last_commit', 'npm_weekly_downloads',
    'health_status', 'verified',
    'score_total', 'score_security', 'score_maintenance',
    'score_documentation', 'score_compatibility', 'score_efficiency',
    'cve_count', 'has_authentication',
    'total_tool_tokens', 'token_efficiency_grade',
    'tools', 'resources', 'prompts',
  ].join(', ')

  let query = supabase
    .from('servers')
    .select(fields, { count: 'exact' })
    .eq('is_archived', false)

  // Filters
  if (q) {
    const safe = sanitizeSearchQuery(q)
    if (safe) query = query.or(`name.ilike.%${safe}%,tagline.ilike.%${safe}%,description.ilike.%${safe}%`)
  }
  if (category) query = query.contains('categories', [category])
  if (status) query = query.eq('health_status', status)
  if (transport) query = query.contains('transport', [transport])
  if (minScore > 0) query = query.gte('score_total', minScore)

  // Sort
  switch (sort) {
    case 'stars':
      query = query.order('github_stars', { ascending: false })
      break
    case 'downloads':
      query = query.order('npm_weekly_downloads', { ascending: false })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    case 'name':
      query = query.order('name', { ascending: true })
      break
    default:
      query = query.order('score_total', { ascending: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      servers: data || [],
      total: count || 0,
      limit,
      offset,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    }
  )
}
