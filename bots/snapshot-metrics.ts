/**
 * Daily Metrics Snapshot — records ecosystem stats for historical tracking.
 * Runs daily at 5:30am UTC via GitHub Actions (after compute-scores at 5am).
 *
 * Usage:
 *   npx tsx bots/snapshot-metrics.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createAdminClient } from './lib/supabase'
import { BotRun } from './lib/bot-run'

const supabase = createAdminClient()

async function fetchAllServers() {
  const fields = 'categories,health_status,author_type,api_pricing,transport,compatible_clients,score_total,score_security,score_maintenance,score_documentation,score_compatibility,score_efficiency,token_efficiency_grade,github_stars,npm_weekly_downloads,cve_count,has_authentication,tools,created_at'
  const pageSize = 1000
  let servers: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('servers')
      .select(fields)
      .eq('is_archived', false)
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    servers = servers.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return servers
}

async function main() {
  const run = await BotRun.start('snapshot-metrics')

  try {
    // 1. Fetch all servers + security data in parallel
    const [servers, { data: allAdvisories }, { count: toolPoisoningCount }, { count: injectionRiskCount }] = await Promise.all([
      fetchAllServers(),
      supabase.from('security_advisories').select('severity, status'),
      supabase.from('servers').select('id', { count: 'exact', head: true }).eq('has_tool_poisoning', true).eq('is_archived', false),
      supabase.from('servers').select('id', { count: 'exact', head: true }).eq('has_injection_risk', true).eq('is_archived', false),
    ])

    const all = servers as Array<Record<string, unknown>>
    const total = all.length

    // 2. Compute score averages
    const sum = (key: string) => all.reduce((s, x) => s + ((x[key] as number) || 0), 0)
    const avg = (key: string) => total === 0 ? 0 : Math.round(sum(key) / total)

    // 3. Score distribution (10 buckets)
    const scoreBuckets = Array.from({ length: 10 }, (_, i) => {
      const lo = i * 10
      const hi = lo + 10
      const label = `${lo}-${hi === 100 ? 100 : hi - 1}`
      const count = all.filter(s => {
        const sc = (s.score_total as number) || 0
        return hi === 100 ? sc >= lo && sc <= 100 : sc >= lo && sc < hi
      }).length
      return { label, count }
    })

    // 4. Category counts
    const categories: Record<string, number> = {}
    for (const s of all) {
      for (const c of (s.categories as string[]) || []) {
        categories[c] = (categories[c] || 0) + 1
      }
    }

    // 5. Health status
    const healthStatus: Record<string, number> = {}
    for (const s of all) {
      const h = (s.health_status as string) || 'unknown'
      healthStatus[h] = (healthStatus[h] || 0) + 1
    }

    // 6. Author type
    const authorType: Record<string, number> = { official: 0, community: 0, unknown: 0 }
    for (const s of all) {
      const a = (s.author_type as string) || 'unknown'
      authorType[a] = (authorType[a] || 0) + 1
    }

    // 7. API pricing
    const apiPricing: Record<string, number> = { free: 0, freemium: 0, paid: 0, unknown: 0 }
    for (const s of all) {
      const p = (s.api_pricing as string) || 'unknown'
      apiPricing[p] = (apiPricing[p] || 0) + 1
    }

    // 8. Transport protocols
    const transport: Record<string, number> = {}
    for (const s of all) {
      for (const t of (s.transport as string[]) || []) {
        transport[t] = (transport[t] || 0) + 1
      }
    }

    // 9. Compatible clients
    const compatibleClients: Record<string, number> = {}
    for (const s of all) {
      for (const c of (s.compatible_clients as string[]) || []) {
        compatibleClients[c] = (compatibleClients[c] || 0) + 1
      }
    }

    // 10. Token efficiency grades
    const tokenEfficiencyGrades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0, unknown: 0 }
    for (const s of all) {
      const g = (s.token_efficiency_grade as string) || 'unknown'
      tokenEfficiencyGrades[g] = (tokenEfficiencyGrades[g] || 0) + 1
    }

    // 11. Security metrics from advisories
    const advisories = (allAdvisories || []) as Array<{ severity: string; status: string }>
    const openAdvisories = advisories.filter(a => a.status === 'open')

    // 12. Servers added today
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const serversAddedToday = all.filter(s => new Date(s.created_at as string) >= todayStart).length

    // 13. Upsert the snapshot
    const snapshotDate = new Date().toISOString().slice(0, 10)
    const row = {
      snapshot_date: snapshotDate,
      total_servers: total,
      servers_added_today: serversAddedToday,
      avg_score_total: avg('score_total'),
      avg_score_security: avg('score_security'),
      avg_score_maintenance: avg('score_maintenance'),
      avg_score_documentation: avg('score_documentation'),
      avg_score_compatibility: avg('score_compatibility'),
      avg_score_efficiency: avg('score_efficiency'),
      total_github_stars: sum('github_stars'),
      total_npm_weekly_downloads: sum('npm_weekly_downloads'),
      total_tools: all.reduce((s, x) => s + ((x.tools as unknown[])?.length || 0), 0),
      servers_with_cves: all.filter(s => ((s.cve_count as number) || 0) > 0).length,
      servers_with_auth: all.filter(s => s.has_authentication === true).length,
      open_cves: openAdvisories.length,
      fixed_cves: advisories.filter(a => a.status === 'fixed').length,
      total_cves: advisories.length,
      cves_critical: openAdvisories.filter(a => a.severity === 'critical').length,
      cves_high: openAdvisories.filter(a => a.severity === 'high').length,
      cves_medium: openAdvisories.filter(a => a.severity === 'medium').length,
      cves_low: openAdvisories.filter(a => a.severity === 'low').length,
      cves_unscored: openAdvisories.filter(a => !['critical', 'high', 'medium', 'low'].includes(a.severity)).length,
      tool_poisoning_count: toolPoisoningCount || 0,
      injection_risk_count: injectionRiskCount || 0,
      score_buckets: scoreBuckets,
      categories,
      health_status: healthStatus,
      author_type: authorType,
      api_pricing: apiPricing,
      transport,
      compatible_clients: compatibleClients,
      token_efficiency_grades: tokenEfficiencyGrades,
    }

    const { error } = await supabase
      .from('daily_metrics')
      .upsert(row, { onConflict: 'snapshot_date' })

    if (error) throw new Error(`Upsert failed: ${error.message}`)

    console.log(`[snapshot-metrics] ${snapshotDate}: ${total} servers, ${openAdvisories.length} open CVEs, ${serversAddedToday} added today`)

    run.addProcessed(total)
    run.addUpdated(1)
    await run.finish()
  } catch (err) {
    await run.fail(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
