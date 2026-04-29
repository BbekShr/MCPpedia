import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { submitServerSchema } from '@/lib/validators'
import { fetchRepoMetadata, fetchReadme } from '@/lib/github'
import { rateLimitUser } from '@/lib/rate-limit'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
} from '@/lib/scoring'
import { revalidateServer, revalidateProfile } from '@/lib/revalidate'
import { normalizeGithubUrl, normalizePackageName } from '@/lib/normalize'
import type { Tool } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitUser(user.id, 'submit', 5, 3600_000) // 5 per hour
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

  const normalizedGithubUrl = normalizeGithubUrl(data.github_url)
  const normalizedNpm = normalizePackageName(data.npm_package)
  const normalizedPip = normalizePackageName(data.pip_package)

  // Check for duplicate slug
  const { data: existingBySlug } = await supabase
    .from('servers')
    .select('slug, name, is_archived')
    .eq('slug', slug)
    .maybeSingle()

  if (existingBySlug) {
    return NextResponse.json({
      error: 'duplicate_slug',
      message: 'A server with this name already exists.',
      existing: {
        slug: existingBySlug.slug,
        name: existingBySlug.name,
        url: `/s/${existingBySlug.slug}`,
        archived: existingBySlug.is_archived,
      },
    }, { status: 409 })
  }

  // Check for duplicate GitHub URL or package across active rows (normalized).
  // Older rows may not yet be normalized in-place, so we filter the candidate
  // set in JS rather than an exact `.eq()`.
  const orFilters: string[] = []
  if (normalizedGithubUrl) {
    const fragment = normalizedGithubUrl.replace(/^https:\/\//, '')
    orFilters.push(`github_url.ilike.%${fragment}%`)
  }
  if (normalizedNpm) orFilters.push(`npm_package.ilike.${normalizedNpm}`)
  if (normalizedPip) orFilters.push(`pip_package.ilike.${normalizedPip}`)

  if (orFilters.length > 0) {
    type CandidateRow = {
      slug: string
      name: string
      github_url: string | null
      npm_package: string | null
      pip_package: string | null
      is_archived: boolean
    }

    const { data: candidates } = await supabase
      .from('servers')
      .select('slug, name, github_url, npm_package, pip_package, is_archived')
      .or(orFilters.join(','))
      .eq('is_archived', false)
      .limit(20)

    const conflict = ((candidates as unknown as CandidateRow[]) || []).find((c: CandidateRow) =>
      (normalizedGithubUrl !== null && normalizeGithubUrl(c.github_url) === normalizedGithubUrl) ||
      (normalizedNpm !== null && normalizePackageName(c.npm_package) === normalizedNpm) ||
      (normalizedPip !== null && normalizePackageName(c.pip_package) === normalizedPip)
    )

    if (conflict) {
      return NextResponse.json({
        error: 'duplicate',
        message: 'This server is already on MCPpedia. Edit or claim the existing entry instead.',
        existing: {
          slug: conflict.slug,
          name: conflict.name,
          url: `/s/${conflict.slug}`,
        },
      }, { status: 409 })
    }
  }

  // Enrich from GitHub
  let meta = null
  if (normalizedGithubUrl) {
    meta = await fetchRepoMetadata(normalizedGithubUrl)
  }

  const { data: server, error } = await supabase
    .from('servers')
    .insert({
      slug,
      name: data.name,
      tagline: data.tagline || meta?.description || null,
      github_url: normalizedGithubUrl,
      npm_package: normalizedNpm,
      pip_package: normalizedPip,
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
    if (error.code === '23505') {
      // Race with the pre-submit dedup check — DB index caught it.
      return NextResponse.json({
        error: 'duplicate',
        message: 'This server is already on MCPpedia.',
      }, { status: 409 })
    }
    console.error('submit insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit server' }, { status: 500 })
  }

  // Compute scores immediately so the server isn't listed without a score
  try {
    const admin = createAdminClient('submit-post-score')
    const tools = (server.tools || []) as Tool[]

    const security = await scanSecurity(
      server.npm_package,
      server.pip_package,
      server.has_authentication || false,
      server.license,
      server.is_archived || false,
      server.security_verified || false,
      tools,
      server.tool_definition_hash || null
    )

    const efficiency = measureTokenEfficiency(tools)

    let readme: string | null = null
    if (server.github_url) {
      readme = await fetchReadme(server.github_url)
    }

    const docs = await scoreDocumentation(
      readme,
      server.description,
      server.tagline,
      tools,
      server.install_configs || {},
      server.api_name,
      server.github_url,
      server.homepage_url
    )

    const compat = scoreCompatibility(
      server.transport || [],
      server.compatible_clients || [],
      tools
    )

    const maint = scoreMaintenance(
      server.github_last_commit,
      server.github_stars || 0,
      server.npm_weekly_downloads || 0,
      server.github_open_issues || 0,
      server.is_archived || false,
      server.verified || false
    )

    const total = Math.min(100, security.score + efficiency.score + docs.score + compat.score + maint.score)

    await admin
      .from('servers')
      .update({
        score_total: total,
        score_security: security.score,
        score_maintenance: maint.score,
        score_documentation: docs.score,
        score_compatibility: compat.score,
        score_efficiency: efficiency.score,
        score_computed_at: new Date().toISOString(),
        has_authentication: security.has_authentication,
        cve_count: security.cve_count,
        security_scan_status: security.scan_status,
        last_security_scan: new Date().toISOString(),
        security_evidence: security.evidence,
        has_code_execution: security.evidence.some(e => e.id === 'tool-safety' && e.pass === false),
        has_injection_risk: security.evidence.some(e => (e.id === 'injection' || e.id === 'tool-poisoning') && e.pass === false),
        dangerous_pattern_count: security.evidence.find(e => e.id === 'tool-safety')?.points !== undefined
          ? (security.evidence.find(e => e.id === 'tool-safety')!.max_points - security.evidence.find(e => e.id === 'tool-safety')!.points)
          : 0,
        dep_health_score: security.evidence.find(e => e.id === 'dep-health')?.points ?? null,
        has_tool_poisoning: security.has_tool_poisoning,
        tool_poisoning_flags: security.tool_poisoning_flags,
        tool_definition_hash: security.tool_definition_hash,
        total_tool_tokens: efficiency.total_tool_tokens,
        estimated_tokens_per_call: efficiency.estimated_tokens_per_call,
        token_efficiency_grade: efficiency.grade,
        doc_readme_quality: docs.readme_quality,
        doc_has_setup: docs.has_setup_instructions,
        doc_has_examples: docs.has_examples,
        doc_tool_schema_ratio: tools.length > 0
          ? tools.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0).length / tools.length
          : null,
      })
      .eq('id', server.id)

    if (security.advisories.length > 0) {
      for (const adv of security.advisories) {
        await admin
          .from('security_advisories')
          .upsert(
            {
              server_id: server.id,
              cve_id: adv.cve_id,
              severity: adv.severity,
              cvss_score: adv.cvss_score,
              title: adv.title,
              description: adv.description,
              affected_versions: adv.affected_versions,
              fixed_version: adv.fixed_version,
              source_url: adv.source_url,
              status: adv.status,
              published_at: adv.published_at,
            },
            { onConflict: 'server_id,cve_id', ignoreDuplicates: false }
          )
      }
    }

    server.score_total = total
  } catch (e) {
    console.error('submit scoring error:', (e as Error).message)
    // Scoring failure doesn't block the submission
  }

  // Make the new server and the submitter's profile visible immediately
  // (karma is awarded by a DB trigger on the servers insert above).
  revalidateServer(slug)
  const { data: submitter } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (submitter?.username) revalidateProfile(submitter.username)

  return NextResponse.json({ server }, { status: 201 })
}
