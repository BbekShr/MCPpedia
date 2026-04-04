import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchRepoMetadata, fetchReadme } from '@/lib/github'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
} from '@/lib/scoring'
import type { Tool } from '@/lib/types'

async function fetchNpmDownloads(packageName: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data.downloads || 0
  } catch {
    return 0
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Auth: only maintainers and admins may trigger a score refresh
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data: server, error } = await supabase
    .from('servers')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }

  // 1. Refresh GitHub metadata
  let repoMeta = null
  if (server.github_url) {
    repoMeta = await fetchRepoMetadata(server.github_url)
    if (repoMeta) {
      await supabase
        .from('servers')
        .update({
          github_stars: repoMeta.stars,
          github_last_commit: repoMeta.lastCommit,
          github_open_issues: repoMeta.openIssues,
          is_archived: repoMeta.archived,
          health_checked_at: new Date().toISOString(),
        })
        .eq('id', server.id)

      // Use fresh values for scoring
      server.github_stars = repoMeta.stars
      server.github_last_commit = repoMeta.lastCommit
      server.github_open_issues = repoMeta.openIssues
      server.is_archived = repoMeta.archived
    }
  }

  // Refresh npm downloads
  let downloads = server.npm_weekly_downloads || 0
  if (server.npm_package) {
    downloads = await fetchNpmDownloads(server.npm_package)
    await supabase
      .from('servers')
      .update({ npm_weekly_downloads: downloads })
      .eq('id', server.id)
    server.npm_weekly_downloads = downloads
  }

  // 2. Recompute all scores
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

  // 3. Save scores
  await supabase
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

  // Upsert security advisories
  if (security.advisories.length > 0) {
    for (const adv of security.advisories) {
      await supabase
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

  return NextResponse.json({
    score_total: total,
    score_security: security.score,
    score_maintenance: maint.score,
    score_documentation: docs.score,
    score_compatibility: compat.score,
    score_efficiency: efficiency.score,
    score_computed_at: new Date().toISOString(),
  })
}
