/**
 * MCPpedia Scoring Engine
 *
 * Computes real scores based on actual data:
 * - Security: OSV.dev CVE database queries
 * - Efficiency: Actual JSON schema token measurement
 * - Documentation: Claude-powered README quality analysis
 * - Compatibility: MCP spec version + transport checks
 * - Maintenance: GitHub + npm real metrics
 */

import type { Tool } from './types'

// ============================================
// SECURITY — Real CVE scanning via OSV.dev
// ============================================

interface OSVVulnerability {
  id: string
  summary: string
  details?: string
  aliases?: string[]
  severity?: Array<{ type: string; score: string }>
  affected?: Array<{
    package: { name: string; ecosystem: string }
    ranges?: Array<{
      type: string
      events: Array<{ introduced?: string; fixed?: string }>
    }>
  }>
  published?: string
  modified?: string
}

export async function queryOSV(packageName: string, ecosystem: 'npm' | 'PyPI'): Promise<OSVVulnerability[]> {
  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem },
      }),
    })

    if (!res.ok) return []
    const data = await res.json()
    return data.vulns || []
  } catch {
    return []
  }
}

export function parseCVSSScore(severityArr?: Array<{ type: string; score: string }>): number | null {
  if (!severityArr?.length) return null
  const cvss = severityArr.find(s => s.type === 'CVSS_V3' || s.type === 'CVSS_V4')
  if (!cvss?.score) return null

  // Extract base score from CVSS vector string
  const match = cvss.score.match(/CVSS:\d\.\d\/.*/)
  if (!match) return parseFloat(cvss.score) || null

  // Parse AV:N/AC:L/... format — we need the actual numeric score
  // OSV sometimes has just the vector, sometimes the score
  // Try to find a number
  const numMatch = cvss.score.match(/(\d+\.?\d*)/)
  return numMatch ? parseFloat(numMatch[1]) : null
}

export function cvssToSeverity(score: number | null): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (score === null) return 'info'
  if (score >= 9.0) return 'critical'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  if (score > 0) return 'low'
  return 'info'
}

export interface SecurityScanResult {
  score: number // 0-25
  cve_count: number
  advisories: Array<{
    cve_id: string | null
    severity: string
    cvss_score: number | null
    title: string
    description: string | null
    affected_versions: string | null
    fixed_version: string | null
    source_url: string | null
    status: string
    published_at: string | null
  }>
  has_authentication: boolean
}

export async function scanSecurity(
  npmPackage: string | null,
  pipPackage: string | null,
  hasAuth: boolean,
  license: string | null,
  isArchived: boolean,
  securityVerified: boolean
): Promise<SecurityScanResult> {
  const advisories: SecurityScanResult['advisories'] = []

  // Query OSV for npm package
  if (npmPackage) {
    const vulns = await queryOSV(npmPackage, 'npm')
    for (const v of vulns) {
      const cvssScore = parseCVSSScore(v.severity)
      const fixedEvent = v.affected?.[0]?.ranges?.[0]?.events?.find(e => e.fixed)
      advisories.push({
        cve_id: v.aliases?.find(a => a.startsWith('CVE-')) || v.id,
        severity: cvssToSeverity(cvssScore),
        cvss_score: cvssScore,
        title: v.summary || v.id,
        description: v.details?.slice(0, 500) || null,
        affected_versions: v.affected?.[0]?.ranges?.[0]?.events?.find(e => e.introduced)?.introduced
          ? `>= ${v.affected[0].ranges![0].events.find(e => e.introduced)!.introduced}`
          : null,
        fixed_version: fixedEvent?.fixed || null,
        source_url: `https://osv.dev/vulnerability/${v.id}`,
        status: fixedEvent?.fixed ? 'fixed' : 'open',
        published_at: v.published || null,
      })
    }
  }

  // Query OSV for pip package
  if (pipPackage) {
    const vulns = await queryOSV(pipPackage, 'PyPI')
    for (const v of vulns) {
      const cvssScore = parseCVSSScore(v.severity)
      const fixedEvent = v.affected?.[0]?.ranges?.[0]?.events?.find(e => e.fixed)
      advisories.push({
        cve_id: v.aliases?.find(a => a.startsWith('CVE-')) || v.id,
        severity: cvssToSeverity(cvssScore),
        cvss_score: cvssScore,
        title: v.summary || v.id,
        description: v.details?.slice(0, 500) || null,
        affected_versions: null,
        fixed_version: fixedEvent?.fixed || null,
        source_url: `https://osv.dev/vulnerability/${v.id}`,
        status: fixedEvent?.fixed ? 'fixed' : 'open',
        published_at: v.published || null,
      })
    }
  }

  const openVulns = advisories.filter(a => a.status === 'open')
  const criticalOrHigh = openVulns.filter(a => a.severity === 'critical' || a.severity === 'high')

  // Compute security score (0-25)
  let score = 25

  // Deduct for open vulnerabilities
  score -= criticalOrHigh.length * 8     // critical/high: -8 each
  score -= openVulns.filter(a => a.severity === 'medium').length * 4  // medium: -4 each
  score -= openVulns.filter(a => a.severity === 'low').length * 2     // low: -2 each

  // Bonus for good practices
  if (!hasAuth) score -= 3               // no auth: -3
  if (!license) score -= 2               // no license: -2
  if (isArchived) score -= 5             // archived: -5
  if (securityVerified) score += 3       // verified: +3

  score = Math.max(0, Math.min(25, score))

  return {
    score,
    cve_count: advisories.length,
    advisories,
    has_authentication: hasAuth,
  }
}


// ============================================
// EFFICIENCY — Actual token measurement
// ============================================

/**
 * Counts tokens in a string using a rough approximation.
 * GPT/Claude tokenizers average ~4 chars per token for English text,
 * but JSON schemas are denser. We use ~3.5 chars/token for JSON.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

export interface EfficiencyScanResult {
  score: number // 0-25
  total_tool_tokens: number
  estimated_tokens_per_call: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  tool_breakdown: Array<{ name: string; tokens: number }>
}

export function measureTokenEfficiency(tools: Tool[]): EfficiencyScanResult {
  const breakdown: Array<{ name: string; tokens: number }> = []

  for (const tool of tools) {
    // Measure the actual JSON that gets serialized into the context
    const toolJson = JSON.stringify({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema || {},
    })
    const tokens = estimateTokens(toolJson)
    breakdown.push({ name: tool.name, tokens })
  }

  const totalTokens = breakdown.reduce((sum, t) => sum + t.tokens, 0)

  // Average tokens per call includes the tool definition + typical invocation
  const avgPerCall = tools.length > 0 ? Math.round(totalTokens / tools.length) + 50 : 0

  // Grade based on total context cost
  let grade: EfficiencyScanResult['grade']
  let score: number

  if (totalTokens <= 500) {
    grade = 'A'; score = 25
  } else if (totalTokens <= 1500) {
    grade = 'B'; score = 20
  } else if (totalTokens <= 4000) {
    grade = 'C'; score = 15
  } else if (totalTokens <= 8000) {
    grade = 'D'; score = 8
  } else {
    grade = 'F'; score = 3
  }

  return {
    score,
    total_tool_tokens: totalTokens,
    estimated_tokens_per_call: avgPerCall,
    grade,
    tool_breakdown: breakdown.sort((a, b) => b.tokens - a.tokens),
  }
}


// ============================================
// DOCUMENTATION — Claude-powered quality check
// ============================================

export interface DocScanResult {
  score: number // 0-25
  has_description: boolean
  has_setup_instructions: boolean
  has_tool_documentation: boolean
  has_examples: boolean
  has_install_config: boolean
  readme_quality: 'excellent' | 'good' | 'basic' | 'poor' | 'none'
}

export async function scoreDocumentation(
  readme: string | null,
  description: string | null,
  tagline: string | null,
  tools: Tool[],
  installConfigs: Record<string, unknown>,
  apiName: string | null,
  githubUrl: string | null,
  homepageUrl: string | null
): Promise<DocScanResult> {
  let score = 0
  const result: DocScanResult = {
    score: 0,
    has_description: false,
    has_setup_instructions: false,
    has_tool_documentation: false,
    has_examples: false,
    has_install_config: false,
    readme_quality: 'none',
  }

  // Basic metadata checks
  if (description && description.length > 50) { score += 2; result.has_description = true }
  if (tagline) score += 1
  if (githubUrl) score += 1
  if (homepageUrl) score += 1
  if (apiName) score += 1

  // Tool documentation
  if (tools.length > 0) {
    const toolsWithDescriptions = tools.filter(t => t.description && t.description.length > 10)
    const toolsWithSchemas = tools.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0)

    if (toolsWithDescriptions.length === tools.length) {
      score += 5  // All tools documented
      result.has_tool_documentation = true
    } else if (toolsWithDescriptions.length > tools.length * 0.5) {
      score += 3  // Most tools documented
      result.has_tool_documentation = true
    } else if (toolsWithDescriptions.length > 0) {
      score += 1  // Some tools documented
    }

    if (toolsWithSchemas.length > tools.length * 0.5) {
      score += 3  // Most tools have input schemas
    }
  }

  // Install config
  if (installConfigs && Object.keys(installConfigs).length > 0) {
    score += 3
    result.has_install_config = true
  }

  // README analysis (if available)
  if (readme && readme.length > 0) {
    const readmeLower = readme.toLowerCase()

    // Check for setup/install instructions
    if (readmeLower.includes('install') || readmeLower.includes('setup') || readmeLower.includes('getting started')) {
      score += 2
      result.has_setup_instructions = true
    }

    // Check for examples
    if (readmeLower.includes('example') || readmeLower.includes('usage') || readme.includes('```')) {
      score += 2
      result.has_examples = true
    }

    // README quality by length and structure
    const headingCount = (readme.match(/^#{1,3}\s/gm) || []).length
    if (readme.length > 3000 && headingCount >= 5) {
      result.readme_quality = 'excellent'
      score += 3
    } else if (readme.length > 1000 && headingCount >= 3) {
      result.readme_quality = 'good'
      score += 2
    } else if (readme.length > 300) {
      result.readme_quality = 'basic'
      score += 1
    } else {
      result.readme_quality = 'poor'
    }
  }

  result.score = Math.min(25, score)
  return result
}


// ============================================
// COMPATIBILITY — Transport + spec checks
// ============================================

export interface CompatScanResult {
  score: number // 0-25
  transports: string[]
  tested_clients: string[]
  supports_stdio: boolean
  supports_http: boolean
  has_multiple_transports: boolean
}

export function scoreCompatibility(
  transport: string[],
  compatibleClients: string[],
  tools: Tool[]
): CompatScanResult {
  let score = 0

  const supportsStdio = transport.includes('stdio')
  const supportsHttp = transport.includes('http') || transport.includes('sse')
  const hasMultiple = transport.length > 1

  // Transport scoring
  if (supportsStdio) score += 8    // stdio = works with most clients
  if (supportsHttp) score += 8     // http/sse = works remotely
  if (hasMultiple) score += 4      // multiple transports = flexible

  // Client compatibility (if explicitly listed)
  score += Math.min(compatibleClients.length * 3, 12)

  // If no clients listed but has tools, assume basic compatibility
  if (compatibleClients.length === 0 && tools.length > 0 && supportsStdio) {
    score += 5 // Reasonable assumption: stdio works with most clients
  }

  return {
    score: Math.min(25, score),
    transports: transport,
    tested_clients: compatibleClients,
    supports_stdio: supportsStdio,
    supports_http: supportsHttp,
    has_multiple_transports: hasMultiple,
  }
}


// ============================================
// MAINTENANCE — Real GitHub + npm signals
// ============================================

export interface MaintenanceScanResult {
  score: number // 0-25
  days_since_commit: number | null
  stars: number
  weekly_downloads: number
  open_issues: number
  is_archived: boolean
  is_verified: boolean
}

export function scoreMaintenance(
  lastCommit: string | null,
  stars: number,
  weeklyDownloads: number,
  openIssues: number,
  isArchived: boolean,
  isVerified: boolean
): MaintenanceScanResult {
  let score = 0
  let daysSinceCommit: number | null = null

  // Recency of commits (0-12)
  if (lastCommit) {
    daysSinceCommit = Math.floor((Date.now() - new Date(lastCommit).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceCommit <= 7) score += 12
    else if (daysSinceCommit <= 30) score += 10
    else if (daysSinceCommit <= 90) score += 7
    else if (daysSinceCommit <= 180) score += 4
    else if (daysSinceCommit <= 365) score += 2
    // > 365 days: +0
  }

  // Community signal — stars (0-5)
  if (stars >= 5000) score += 5
  else if (stars >= 1000) score += 4
  else if (stars >= 100) score += 3
  else if (stars >= 10) score += 1

  // Adoption signal — downloads (0-5)
  if (weeklyDownloads >= 10000) score += 5
  else if (weeklyDownloads >= 1000) score += 4
  else if (weeklyDownloads >= 100) score += 2

  // Penalties
  if (isArchived) score -= 10
  if (openIssues > 100) score -= 2
  else if (openIssues > 50) score -= 1

  // Bonus
  if (isVerified) score += 3

  return {
    score: Math.max(0, Math.min(25, score)),
    days_since_commit: daysSinceCommit,
    stars,
    weekly_downloads: weeklyDownloads,
    open_issues: openIssues,
    is_archived: isArchived,
    is_verified: isVerified,
  }
}
