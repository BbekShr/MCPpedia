/**
 * Score Computation Bot — computes real MCPpedia scores for all servers.
 * Uses OSV.dev for CVE data, actual token measurement, README analysis.
 * Runs daily via GitHub Actions.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'
import { getReadme } from './lib/github'
import {
  scanSecurity,
  measureTokenEfficiency,
  scoreDocumentation,
  scoreCompatibility,
  scoreMaintenance,
  SCORE_WEIGHTS,
} from '../lib/scoring'
import type { Tool } from '../lib/types'

const supabase = createAdminClient('bot-compute-scores')

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function main() {
  const run = await BotRun.start('compute-scores')
  try {
  console.log('=== MCPpedia Score Computation ===')
  console.log(new Date().toISOString())

  // Supabase returns max 1000 rows by default — paginate to get all
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servers: any[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: batch, error: batchError } = await supabase
      .from('servers')
      .select('*')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (batchError) {
      console.error('Failed to fetch servers:', batchError.message)
      return
    }
    if (!batch || batch.length === 0) break
    servers.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }

  if (servers.length === 0) {
    console.error('No servers found')
    return
  }

  console.log(`Computing scores for ${servers.length} servers...\n`)

  let processed = 0

  for (const server of servers) {
    console.log(`[${processed + 1}/${servers.length}] ${server.slug}`)

    // 2. EFFICIENCY — measure actual tool schema tokens (compute tools early, security needs it)
    const tools = (server.tools || []) as Tool[]

    // 1. SECURITY — CVEs + tool safety + tool poisoning + injection vectors + dep health
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
    console.log(`  Security: ${security.score}/${SCORE_WEIGHTS.security} (${security.cve_count} CVEs, ${security.evidence.length} checks)`)
    const efficiency = measureTokenEfficiency(tools)
    console.log(`  Efficiency: ${efficiency.score}/${SCORE_WEIGHTS.efficiency} (${efficiency.total_tool_tokens} tokens, grade ${efficiency.grade})`)

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
    console.log(`  Documentation: ${docs.score}/${SCORE_WEIGHTS.documentation} (README: ${docs.readme_quality})`)

    // 4. COMPATIBILITY — transport + client checks
    const compat = scoreCompatibility(
      server.transport || [],
      server.compatible_clients || [],
      tools
    )
    console.log(`  Compatibility: ${compat.score}/${SCORE_WEIGHTS.compatibility}`)

    // 5. MAINTENANCE — GitHub + npm metrics
    const maint = scoreMaintenance(
      server.github_last_commit,
      server.github_stars || 0,
      server.npm_weekly_downloads || 0,
      server.github_open_issues || 0,
      server.is_archived || false,
      server.verified || false
    )
    console.log(`  Maintenance: ${maint.score}/${SCORE_WEIGHTS.maintenance}`)

    const total = Math.min(100, security.score + efficiency.score + docs.score + compat.score + maint.score)
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
        security_scan_status: security.scan_status,
        last_security_scan: new Date().toISOString(),
        security_evidence: security.evidence,
        has_code_execution: security.evidence.some(e => e.id === 'tool-safety' && e.pass === false),
        has_injection_risk: security.evidence.some(e => e.id === 'injection' && e.pass === false),
        dangerous_pattern_count: security.evidence.find(e => e.id === 'tool-safety')?.points !== undefined
          ? (security.evidence.find(e => e.id === 'tool-safety')!.max_points - security.evidence.find(e => e.id === 'tool-safety')!.points)
          : 0,
        dep_health_score: security.evidence.find(e => e.id === 'dep-health')?.points ?? null,
        dependency_count: null, // deps.dev doesn't reliably return this yet
        has_tool_poisoning: security.has_tool_poisoning,
        tool_poisoning_flags: security.tool_poisoning_flags,
        tool_definition_hash: security.tool_definition_hash,
        // Efficiency fields
        total_tool_tokens: efficiency.total_tool_tokens,
        estimated_tokens_per_call: efficiency.estimated_tokens_per_call,
        token_efficiency_grade: efficiency.grade,
        // Documentation evidence
        doc_readme_quality: docs.readme_quality,
        doc_has_setup: docs.has_setup_instructions,
        doc_has_examples: docs.has_examples,
        doc_tool_schema_ratio: tools.length > 0
          ? tools.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0).length / tools.length
          : null,
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
            { onConflict: 'server_id,cve_id', ignoreDuplicates: false }
          )
      }
    }

    processed++
    run.addProcessed()
    run.addUpdated()

    // Rate limit — be nice to OSV.dev
    await new Promise(r => setTimeout(r, 300))
  }

  run.setSummary({ scored: processed })
  console.log(`\nDone. Scored ${processed} servers.`)
  await run.finish()
  } catch (err) {
    await run.fail(String(err))
    throw err
  }
}

main().catch(console.error)
