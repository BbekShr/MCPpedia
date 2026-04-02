/**
 * Score Computation Bot — computes real MCPpedia scores for all servers.
 * Uses OSV.dev for CVE data, actual token measurement, README analysis.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { getReadme } from './lib/github'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
} from '../lib/scoring'
import type { Tool } from '../lib/types'

const supabase = createAdminClient()

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function main() {
  console.log('=== MCPpedia Score Computation ===')
  console.log(new Date().toISOString())

  const { data: servers, error } = await supabase
    .from('servers')
    .select('*')

  if (error || !servers) {
    console.error('Failed to fetch servers:', error?.message)
    return
  }

  console.log(`Computing scores for ${servers.length} servers...\n`)

  let processed = 0

  for (const server of servers) {
    console.log(`[${processed + 1}/${servers.length}] ${server.slug}`)

    // 1. SECURITY — query OSV.dev for real CVEs
    const security = await scanSecurity(
      server.npm_package,
      server.pip_package,
      server.has_authentication || false,
      server.license,
      server.is_archived || false,
      server.security_verified || false
    )
    console.log(`  Security: ${security.score}/25 (${security.cve_count} CVEs found)`)

    // 2. EFFICIENCY — measure actual tool schema tokens
    const tools = (server.tools || []) as Tool[]
    const efficiency = measureTokenEfficiency(tools)
    console.log(`  Efficiency: ${efficiency.score}/25 (${efficiency.total_tool_tokens} tokens, grade ${efficiency.grade})`)

    // 3. DOCUMENTATION — analyze README + metadata
    let readme: string | null = null
    if (server.github_url) {
      const parsed = parseGitHubUrl(server.github_url)
      if (parsed) {
        readme = await getReadme(parsed.owner, parsed.repo)
      }
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
    console.log(`  Documentation: ${docs.score}/25 (README: ${docs.readme_quality})`)

    // 4. COMPATIBILITY — transport + client checks
    const compat = scoreCompatibility(
      server.transport || [],
      server.compatible_clients || [],
      tools
    )
    console.log(`  Compatibility: ${compat.score}/25`)

    // 5. MAINTENANCE — GitHub + npm metrics
    const maint = scoreMaintenance(
      server.github_last_commit,
      server.github_stars || 0,
      server.npm_weekly_downloads || 0,
      server.github_open_issues || 0,
      server.is_archived || false,
      server.verified || false
    )
    console.log(`  Maintenance: ${maint.score}/25`)

    const total = security.score + efficiency.score + docs.score + compat.score + maint.score
    console.log(`  TOTAL: ${total}/100\n`)

    // Update server record
    const { error: updateError } = await supabase
      .from('servers')
      .update({
        score_total: total,
        score_security: security.score,
        score_maintenance: maint.score,
        score_documentation: docs.score,
        score_compatibility: compat.score,
        score_efficiency: efficiency.score,
        score_computed_at: new Date().toISOString(),
        // Security fields
        has_authentication: security.has_authentication,
        cve_count: security.cve_count,
        last_security_scan: new Date().toISOString(),
        // Efficiency fields
        total_tool_tokens: efficiency.total_tool_tokens,
        estimated_tokens_per_call: efficiency.estimated_tokens_per_call,
        token_efficiency_grade: efficiency.grade,
      })
      .eq('id', server.id)

    if (updateError) {
      console.error(`  Error updating ${server.slug}: ${updateError.message}`)
    }

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
            { onConflict: 'server_id,cve_id', ignoreDuplicates: true }
          )
      }
    }

    processed++

    // Rate limit — be nice to OSV.dev
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone. Scored ${processed} servers.`)
}

main().catch(console.error)
