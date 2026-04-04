import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { submitServerSchema } from '@/lib/validators'
import { fetchRepoMetadata } from '@/lib/github'
import { rateLimitUser } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimitUser(user.id, 'submit', 5, 3600_000) // 5 per hour
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = submitServerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const slug = data.name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (!slug) {
    return NextResponse.json({ error: 'Name must contain at least one letter or number' }, { status: 400 })
  }

  // Check for duplicate slug
  const { data: existing } = await supabase
    .from('servers')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'A server with this name already exists' }, { status: 409 })
  }

  // Check for duplicate GitHub URL
  const { data: existingByUrl } = await supabase
    .from('servers')
    .select('id, slug')
    .eq('github_url', data.github_url)
    .single()

  if (existingByUrl) {
    return NextResponse.json({ error: 'This GitHub repository is already listed' }, { status: 409 })
  }

  // Enrich from GitHub
  let meta = null
  if (data.github_url) {
    meta = await fetchRepoMetadata(data.github_url)
  }

  const { data: server, error } = await supabase
    .from('servers')
    .insert({
      slug,
      name: data.name,
      tagline: data.tagline || meta?.description || null,
      github_url: data.github_url,
      npm_package: data.npm_package || null,
      pip_package: data.pip_package || null,
      license: data.license || meta?.license || null,
      author_name: data.author_name || meta?.owner || null,
      author_github: data.author_github || meta?.owner || null,
      author_type: 'community',
      transport: data.transport,
      categories: data.categories,
      api_pricing: data.api_pricing,
      requires_api_key: data.requires_api_key,
      github_stars: meta?.stars || 0,
      github_last_commit: meta?.lastCommit || null,
      github_open_issues: meta?.openIssues || 0,
      is_archived: meta?.archived || false,
      homepage_url: meta?.homepage || null,
      health_status: meta?.lastCommit ? 'unknown' : 'unknown',
      source: 'manual',
      submitted_by: user.id,
      verified: false,
    })
    .select()
    .single()

  if (error) {
    console.error('submit insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit server' }, { status: 500 })
  }

  return NextResponse.json({ server }, { status: 201 })
}
