/**
 * MCPpedia Scoring Engine
 *
 * Weighted scoring (100 total):
 * - Security:      30 pts (highest — "will this break my system?")
 * - Maintenance:   25 pts (is it actively developed?)
 * - Efficiency:    20 pts (context window cost)
 * - Documentation: 15 pts (can I actually set it up?)
 * - Compatibility: 10 pts (does it work with my client?)
 */

export const SCORE_WEIGHTS = {
  security: 30,
  maintenance: 25,
  efficiency: 20,
  documentation: 15,
  compatibility: 10,
} as const

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

export interface OSVQueryResult {
  vulns: OSVVulnerability[]
  status: 'success' | 'failed'
}

export async function queryOSV(packageName: string, ecosystem: 'npm' | 'PyPI'): Promise<OSVQueryResult> {
  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem },
      }),
    })

    if (!res.ok) return { vulns: [], status: 'failed' }
    const data = await res.json()
    return { vulns: data.vulns || [], status: 'success' }
  } catch {
    return { vulns: [], status: 'failed' }
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

export type Advisory = {
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
}

export interface SecurityEvidence {
  id: string
  label: string
  pass: boolean | null
  detail: string
  points: number
  max_points: number
  link?: string
  link_text?: string
}

export interface SecurityScanResult {
  score: number // 0-30
  evidence: SecurityEvidence[]
  cve_count: number
  advisories: Advisory[]
  has_authentication: boolean
  scan_status: 'success' | 'failed' | 'pending'
  has_tool_poisoning: boolean
  tool_poisoning_flags: string[]
  tool_definition_hash: string | null
}

// ---- Individual check functions ----

function collectAdvisories(
  npmPackage: string | null,
  pipPackage: string | null,
  osvResults: { npm: OSVQueryResult | null; pip: OSVQueryResult | null }
): Advisory[] {
  const advisories: Advisory[] = []

  function processVulns(vulns: OSVVulnerability[]) {
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

  if (osvResults.npm) processVulns(osvResults.npm.vulns)
  if (osvResults.pip) processVulns(osvResults.pip.vulns)
  return advisories
}

function checkCVEs(
  advisories: Advisory[],
  npmPackage: string | null,
  pipPackage: string | null
): SecurityEvidence {
  const packageName = npmPackage || pipPackage

  // No package = we can't verify, not "safe"
  if (!packageName) {
    return {
      id: 'cve',
      label: 'Known CVEs',
      pass: null,
      detail: 'No package registry to scan',
      points: 0,
      max_points: 15,
    }
  }

  const openVulns = advisories.filter(a => a.status === 'open')
  const criticalOrHigh = openVulns.filter(a => a.severity === 'critical' || a.severity === 'high')
  const medium = openVulns.filter(a => a.severity === 'medium')
  const low = openVulns.filter(a => a.severity === 'low')

  let penalty = criticalOrHigh.length * 5 + medium.length * 3 + low.length * 1
  penalty = Math.min(penalty, 15) // cap at -15

  const points = 15 - penalty

  const osvLink = npmPackage
    ? `https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(npmPackage)}`
    : `https://osv.dev/list?ecosystem=PyPI&q=${encodeURIComponent(pipPackage!)}`

  const detail = openVulns.length === 0
    ? `No known CVEs for ${packageName}`
    : `${openVulns.length} open CVE(s): ${criticalOrHigh.length} critical/high, ${medium.length} medium, ${low.length} low`

  return {
    id: 'cve',
    label: 'Known CVEs',
    pass: openVulns.length === 0 ? true : false,
    detail,
    points,
    max_points: 15,
    link: osvLink,
    link_text: 'check OSV.dev',
  }
}

// Dangerous tool patterns
const EXEC_PATTERNS = /\b(execute|run_command|run_shell|shell|exec|eval|subprocess|spawn)\b/i
const FS_PATTERNS = /\b(file_write|write_file|delete_file|remove_file|rmdir|mkdir|create_file|overwrite)\b/i
const SQL_PATTERNS = /\b(sql_query|raw_query|execute_sql|run_query|raw_sql)\b/i
const SIDE_EFFECT_PATTERNS = /\b(send_email|send_message|post_tweet|publish|deploy|push)\b/i

function checkToolSafety(tools: Tool[], hasAuth: boolean): SecurityEvidence {
  if (tools.length === 0) {
    return { id: 'tool-safety', label: 'Tool safety', pass: null, detail: 'No tools to analyze', points: 0, max_points: 3 }
  }

  let penalty = 0
  const flags: string[] = []

  let hasExec = false, hasFs = false, hasSql = false, hasSideEffects = false
  const toolsWithoutSchema = tools.filter(t => !t.input_schema || Object.keys(t.input_schema).length === 0).length

  for (const tool of tools) {
    const combined = `${tool.name} ${tool.description || ''}`
    if (EXEC_PATTERNS.test(combined)) hasExec = true
    if (FS_PATTERNS.test(combined)) hasFs = true
    if (SQL_PATTERNS.test(combined)) hasSql = true
    if (SIDE_EFFECT_PATTERNS.test(combined)) hasSideEffects = true
  }

  if (hasExec) { penalty += 3; flags.push('code execution') }
  if (hasFs) { penalty += 2; flags.push('filesystem writes') }
  if (hasSql) { penalty += 2; flags.push('raw SQL') }
  if (hasSideEffects) { penalty += 1; flags.push('side effects') }
  if (toolsWithoutSchema > tools.length * 0.5) { penalty += 1; flags.push(`${toolsWithoutSchema} tools without schema`) }

  // Auth mitigates risk
  if (hasAuth && penalty > 0) penalty = Math.ceil(penalty / 2)

  penalty = Math.min(penalty, 3)
  const points = 3 - penalty

  const detail = flags.length === 0
    ? 'No dangerous patterns detected'
    : `Found: ${flags.join(', ')}${hasAuth ? ' (auth mitigates risk)' : ''}`

  return {
    id: 'tool-safety',
    label: 'Tool safety',
    pass: flags.length === 0 ? true : hasExec ? false : null,
    detail,
    points,
    max_points: 3,
  }
}

// ---- Tool poisoning detection (TPA) ----

// Hidden instruction tags embedded in tool metadata
const HIDDEN_INSTRUCTION_TAGS = /<(IMPORTANT|instructions|SYSTEM|system|DIRECTIVE|directive|cmd|command|hidden|secret)\b[^>]*>/i
// Directive keywords — ALL-CAPS only (mixed-case like "Note:" is normal documentation)
const DIRECTIVE_KEYWORDS = /\b(IMPORTANT:|NOTE:|REQUIRED:|MANDATORY:|BEFORE USING|YOU MUST|ALWAYS DO|NEVER TELL)/
// Concealment language — must reference "the user" to distinguish from normal usage
const CONCEALMENT_PATTERNS = /\b(do not tell the user|do not mention this|don't reveal|keep this secret|hide this from|do not show the user|never inform the user|do not let the user)\b/i
// Cross-tool manipulation — requires "tool" context, not generic "replace the"
const CROSS_TOOL_PATTERNS = /\b(modify the behavior of|when this tool is available|instead of using \w+ tool|override the \w+ tool|redirect all .* to)\b/i
// Sensitive file references + exfiltration context (read/access X and pass/send)
const SENSITIVE_FILE_WITH_EXFIL = /(read|access|get|provide|cat|output|retrieve|fetch)[\s\S]{0,50}(~\/\.ssh|\.env\b|mcp\.json|\/etc\/passwd|\.aws\/credentials|\.gnupg|\.kube\/config|id_rsa|\.npmrc|\.pypirc)[\s\S]{0,50}(pass|send|upload|forward|transmit|content as|parameter)/i
const SENSITIVE_FILE_WITH_EXFIL_REV = /(~\/\.ssh|\.env\b|mcp\.json|\/etc\/passwd|\.aws\/credentials|\.gnupg|\.kube\/config|id_rsa|\.npmrc|\.pypirc)[\s\S]{0,50}(pass|send|upload|forward|transmit|content as|parameter)/i
// Sensitive file references in schema strings (param names, defaults) — always suspicious
const SENSITIVE_FILE_IN_SCHEMA = /(?:~\/\.ssh|\.env|mcp\.json|\/etc\/passwd|\.aws\/credentials|\.gnupg|\.kube\/config|id_rsa|\.npmrc|\.pypirc)/i
// Exfiltration — requires passing content/data, not just "send to an address"
const EXFILTRATION_PATTERNS = /\b(pass .{0,20}content as|exfiltrate)\b/i
// External URLs in tool descriptions (unusual and suspicious)
const DESCRIPTION_URL_PATTERN = /https?:\/\/[^\s"'>]+/i
// Unicode obfuscation — invisible characters used to hide instructions
const UNICODE_OBFUSCATION = /[\u200B\u200C\u200D\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/
// Unicode Tags block (U+E0000–U+E007F) — used to hide instructions from UI
const UNICODE_TAGS = /[\u{E0000}-\u{E007F}]/u
// Suspicious parameter names that could serve as exfiltration channels
const SUSPICIOUS_PARAM_NAMES = /^(metadata|notes|side_note|context|extra|memo|comment|annotation|additional_info|callback_url|webhook)$/i

/**
 * Recursively extracts all string values from a JSON schema object.
 * Checks parameter names, descriptions, defaults, enum values — not just top-level descriptions.
 * This catches "full-schema poisoning" where instructions are hidden in parameter metadata.
 */
function walkSchemaStrings(schema: unknown, depth = 0): string[] {
  if (depth > 10) return [] // prevent infinite recursion
  if (!schema || typeof schema !== 'object') return []

  const strings: string[] = []
  const obj = schema as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    // Collect the key itself (parameter names can be poisoned)
    strings.push(key)

    if (typeof value === 'string') {
      strings.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') strings.push(item)
        else strings.push(...walkSchemaStrings(item, depth + 1))
      }
    } else if (typeof value === 'object' && value !== null) {
      strings.push(...walkSchemaStrings(value, depth + 1))
    }
  }

  return strings
}

function checkToolPoisoning(tools: Tool[]): SecurityEvidence & { flags: string[] } {
  if (tools.length === 0) {
    return { id: 'tool-poisoning', label: 'Tool poisoning', pass: null, detail: 'No tools to analyze', points: 0, max_points: 5, flags: [] }
  }

  let penalty = 0
  const flags: string[] = []

  // Build set of tool names for cross-tool reference detection
  const toolNames = new Set(tools.map(t => t.name.toLowerCase()))

  for (const tool of tools) {
    const desc = tool.description || ''
    const schemaStrings = walkSchemaStrings(tool.input_schema)
    const allText = [desc, ...schemaStrings].join(' ')

    // 1. Hidden instruction tags
    if (HIDDEN_INSTRUCTION_TAGS.test(allText)) {
      if (!flags.includes('hidden instructions')) { penalty += 2; flags.push('hidden instructions') }
    }

    // 2. Directive keywords
    if (DIRECTIVE_KEYWORDS.test(allText)) {
      if (!flags.includes('directive keywords')) { penalty += 2; flags.push('directive keywords') }
    }

    // 3. Concealment language
    if (CONCEALMENT_PATTERNS.test(allText)) {
      if (!flags.includes('concealment language')) { penalty += 3; flags.push('concealment language') }
    }

    // 4. Cross-tool manipulation
    if (CROSS_TOOL_PATTERNS.test(allText)) {
      if (!flags.includes('cross-tool manipulation')) { penalty += 2; flags.push('cross-tool manipulation') }
    }
    // Also check if description references other tool names
    for (const otherName of toolNames) {
      if (otherName !== tool.name.toLowerCase() && desc.toLowerCase().includes(otherName) && desc.length > 100) {
        if (!flags.includes('cross-tool references')) { penalty += 1; flags.push('cross-tool references') }
        break
      }
    }

    // 5. Sensitive file references (context-aware: only flag when combined with exfil language)
    if (SENSITIVE_FILE_WITH_EXFIL.test(allText) || SENSITIVE_FILE_WITH_EXFIL_REV.test(allText)) {
      if (!flags.includes('sensitive file exfiltration')) { penalty += 2; flags.push('sensitive file exfiltration') }
    }
    // Also check schema strings for sensitive file refs (always suspicious in param names/defaults)
    for (const s of schemaStrings) {
      if (SENSITIVE_FILE_IN_SCHEMA.test(s) && s !== desc) {
        if (!flags.includes('sensitive files in schema')) { penalty += 2; flags.push('sensitive files in schema') }
        break
      }
    }

    // 6. Exfiltration indicators
    if (EXFILTRATION_PATTERNS.test(allText)) {
      if (!flags.includes('exfiltration language')) { penalty += 1; flags.push('exfiltration language') }
    }
    if (DESCRIPTION_URL_PATTERN.test(desc)) {
      if (!flags.includes('URLs in descriptions')) { penalty += 1; flags.push('URLs in descriptions') }
    }

    // 7. Unicode obfuscation
    if (UNICODE_OBFUSCATION.test(allText) || UNICODE_TAGS.test(allText)) {
      if (!flags.includes('unicode obfuscation')) { penalty += 3; flags.push('unicode obfuscation') }
    }

    // 8. Suspicious unconstrained parameters
    if (tool.input_schema) {
      const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown> | undefined
      if (props) {
        for (const [paramName, paramDef] of Object.entries(props)) {
          if (SUSPICIOUS_PARAM_NAMES.test(paramName)) {
            const def = paramDef as Record<string, unknown> | undefined
            // Only flag if unconstrained (no enum, no pattern, no maxLength)
            if (def && def.type === 'string' && !def.enum && !def.pattern && !def.maxLength) {
              if (!flags.includes('suspicious parameters')) { penalty += 1; flags.push('suspicious parameters') }
            }
          }
        }
      }
    }

    // 9. Anomalous description length
    if (desc.length > 500) {
      if (!flags.includes('long descriptions')) { penalty += 1; flags.push('long descriptions') }
    }
  }

  penalty = Math.min(penalty, 5)
  const points = 5 - penalty

  return {
    id: 'tool-poisoning',
    label: 'Tool poisoning',
    pass: flags.length === 0 ? true : flags.length >= 2 ? false : null,
    detail: flags.length === 0
      ? 'No poisoning indicators detected'
      : `Found: ${flags.join(', ')}`,
    points,
    max_points: 5,
    flags,
  }
}

// ---- Tool definition stability (rug-pull detection) ----

function checkToolDefinitionStability(
  tools: Tool[],
  previousToolHash: string | null
): { evidence: SecurityEvidence; currentHash: string } {
  // Deterministic hash of sorted tool definitions
  const canonical = JSON.stringify(
    tools
      .map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
      .sort((a, b) => a.name.localeCompare(b.name))
  )

  // Simple hash using Web Crypto-compatible approach (sync, no Node crypto needed)
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  const currentHash = Math.abs(hash).toString(36)

  if (!previousToolHash) {
    return {
      evidence: {
        id: 'tool-stability', label: 'Tool stability', pass: null,
        detail: 'First scan — baseline recorded', points: 0, max_points: 1,
      },
      currentHash,
    }
  }

  const changed = previousToolHash !== currentHash
  return {
    evidence: {
      id: 'tool-stability', label: 'Tool stability',
      pass: !changed,
      detail: changed ? 'Tool definitions changed since last scan' : 'Tool definitions stable',
      points: changed ? 0 : 1,
      max_points: 1,
    },
    currentHash,
  }
}

// Injection vector detection
const PERMISSIVE_PATTERNS = /\b(execute any|run arbitrary|any command|arbitrary code|unrestricted)\b/i
const BYPASS_PATTERNS = /\b(ignore previous|override|bypass|system prompt|ignore instructions|disregard)\b/i
const UNSAFE_MARKERS = /\b(raw|unsafe|unvalidated|unsanitized|untrusted|no.?validation)\b/i
const SYSTEM_COMMANDS = /^(bash|sh|cmd|powershell|sudo|su|terminal|console)$/i

function checkInjectionVectors(tools: Tool[]): SecurityEvidence {
  if (tools.length === 0) {
    return { id: 'injection', label: 'Injection vectors', pass: null, detail: 'No tools to analyze', points: 0, max_points: 3 }
  }

  let penalty = 0
  const flags: string[] = []

  let hasPermissive = false, hasBypass = false, hasShadow = false, hasUnsafe = false
  const undocumented = tools.filter(t => !t.description || t.description.length < 5)

  for (const tool of tools) {
    const desc = tool.description || ''
    if (PERMISSIVE_PATTERNS.test(desc)) hasPermissive = true
    if (BYPASS_PATTERNS.test(desc)) hasBypass = true
    if (SYSTEM_COMMANDS.test(tool.name)) hasShadow = true
    if (UNSAFE_MARKERS.test(desc)) hasUnsafe = true

    // Check for unconstrained string input on exec-like tools
    if (EXEC_PATTERNS.test(`${tool.name} ${desc}`) && tool.input_schema) {
      const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown> | undefined
      if (props) {
        const propCount = Object.keys(props).length
        if (propCount === 1) {
          const onlyProp = Object.values(props)[0] as Record<string, unknown> | undefined
          if (onlyProp && onlyProp.type === 'string') {
            penalty += 3
            flags.push('unconstrained exec input')
          }
        }
      }
    }
  }

  if (hasBypass) { penalty += 3; flags.push('safety bypass language') }
  if (hasPermissive) { penalty += 2; flags.push('overly permissive descriptions') }
  if (hasShadow) { penalty += 2; flags.push('shadows system commands') }
  if (hasUnsafe) { penalty += 1; flags.push('unsafe markers') }
  if (undocumented.length > 0) { penalty += Math.min(undocumented.length, 2); flags.push(`${undocumented.length} undocumented tools`) }

  penalty = Math.min(penalty, 3)
  const points = 3 - penalty

  const detail = flags.length === 0
    ? 'No injection vectors detected'
    : `Found: ${flags.join(', ')}`

  return {
    id: 'injection',
    label: 'Injection vectors',
    pass: flags.length === 0 ? true : (hasBypass || hasPermissive) ? false : null,
    detail,
    points,
    max_points: 3,
  }
}

// Dependency health via deps.dev
async function checkDependencyHealth(
  npmPackage: string | null,
  pipPackage: string | null
): Promise<SecurityEvidence> {
  const pkg = npmPackage || pipPackage
  if (!pkg) {
    return { id: 'dep-health', label: 'Dependency health', pass: null, detail: 'No package to analyze', points: 0, max_points: 3 }
  }

  const system = npmPackage ? 'npm' : 'pypi'

  try {
    const res = await fetch(
      `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(pkg)}`,
      { signal: AbortSignal.timeout(5000) }
    )

    if (!res.ok) {
      return { id: 'dep-health', label: 'Dependency health', pass: null, detail: `Not found on deps.dev`, points: 1, max_points: 3 }
    }

    const data = await res.json()
    const versions = data.versions || []
    const latestVersion = versions[versions.length - 1]

    // Get version details for dependency count
    let depCount = 0
    let dependentCount = 0
    let versionAgeDays: number | null = null

    if (latestVersion?.versionKey?.version) {
      try {
        const vRes = await fetch(
          `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(pkg)}/versions/${encodeURIComponent(latestVersion.versionKey.version)}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (vRes.ok) {
          const vData = await vRes.json()
          dependentCount = data.package?.dependentCount || 0
          depCount = (vData.links || []).filter((l: { label: string }) => l.label === 'SOURCE_REPO').length
          if (vData.relatedProjects) depCount = vData.relatedProjects.length

          if (latestVersion.publishedAt) {
            versionAgeDays = Math.floor((Date.now() - new Date(latestVersion.publishedAt).getTime()) / 86400000)
          }
        }
      } catch { /* skip version details */ }
    }

    let score = 1 // exists on deps.dev
    const details: string[] = [`found on deps.dev`]

    if (dependentCount > 10) { score += 1; details.push(`${dependentCount} dependents`) }
    if (versionAgeDays !== null && versionAgeDays < 180) { score += 1; details.push('recently updated') }
    if (depCount > 200) { score -= 1; details.push(`${depCount} deps (bloated)`) }

    score = Math.max(0, Math.min(3, score))

    return {
      id: 'dep-health',
      label: 'Dependency health',
      pass: score >= 3 ? true : score <= 0 ? false : null,
      detail: details.join(', '),
      points: score,
      max_points: 3,
    }
  } catch {
    return { id: 'dep-health', label: 'Dependency health', pass: null, detail: 'Could not reach deps.dev', points: 1, max_points: 3 }
  }
}

function checkLicense(license: string | null): SecurityEvidence {
  const hasLicense = !!license && license !== 'NOASSERTION'
  return {
    id: 'license',
    label: 'License',
    pass: hasLicense ? true : false,
    detail: hasLicense ? `License: ${license}` : 'No license specified',
    points: hasLicense ? 3 : 0,
    max_points: 3,
  }
}

// Recognise auth keywords in tool metadata so we don't credit "no auth" to
// servers that clearly require credentials (the input_schema-only path used to
// miss servers that ship tools without schemas).
const AUTH_KEYWORDS = /\b(oauth|bearer|api[_-]?key|access[_-]?token|refresh[_-]?token|authenticat\w*|credential|client[_-]?secret|personal[_-]?access[_-]?token)\b/i

export function inferAuthFromTools(tools: Tool[]): boolean {
  for (const tool of tools) {
    const haystack = [tool.name, tool.description || '']
    if (tool.input_schema) {
      try { haystack.push(JSON.stringify(tool.input_schema)) } catch { /* ignore */ }
    }
    if (AUTH_KEYWORDS.test(haystack.join(' '))) return true
  }
  return false
}

function checkAuth(hasAuth: boolean, source: 'declared' | 'inferred' | 'none'): SecurityEvidence {
  const detail =
    source === 'declared' ? 'Requires authentication'
    : source === 'inferred' ? 'Authentication inferred from tool metadata'
    : 'No authentication detected'
  return {
    id: 'auth',
    label: 'Authentication',
    pass: hasAuth ? true : null,
    detail,
    points: hasAuth ? 2 : 0,
    max_points: 2,
  }
}

function checkRepoSignals(isArchived: boolean, securityVerified: boolean): SecurityEvidence {
  let points = 2
  const details: string[] = []

  if (isArchived) { points -= 4; details.push('archived') }
  if (securityVerified) { points += 2; details.push('MCPpedia verified') }
  if (!isArchived && !securityVerified) details.push('active repo')

  points = Math.max(-2, Math.min(2, points))

  return {
    id: 'repo',
    label: 'Repository',
    pass: isArchived ? false : securityVerified ? true : null,
    detail: details.join(', ') || 'Active repository',
    points,
    max_points: 2,
  }
}

// ---- Main scan function ----

export async function scanSecurity(
  npmPackage: string | null,
  pipPackage: string | null,
  hasAuth: boolean,
  license: string | null,
  isArchived: boolean,
  securityVerified: boolean,
  tools: Tool[] = [],
  previousToolHash?: string | null
): Promise<SecurityScanResult> {
  // Fetch CVE data from OSV.dev
  const osvResults = {
    npm: npmPackage ? await queryOSV(npmPackage, 'npm') : null,
    pip: pipPackage ? await queryOSV(pipPackage, 'PyPI') : null,
  }
  const anyFailed = (osvResults.npm?.status === 'failed') || (osvResults.pip?.status === 'failed')
  const hasPackageToScan = !!(npmPackage || pipPackage)

  const advisories = collectAdvisories(npmPackage, pipPackage, osvResults)

  // Tool poisoning + stability checks
  const poisoning = checkToolPoisoning(tools)
  const stability = checkToolDefinitionStability(tools, previousToolHash ?? null)

  // Auth: trust the column if set, otherwise infer from tool metadata so we
  // don't penalize servers whose tools lack input schemas.
  const inferredAuth = !hasAuth && inferAuthFromTools(tools)
  const effectiveAuth = hasAuth || inferredAuth
  const authSource: 'declared' | 'inferred' | 'none' =
    hasAuth ? 'declared' : inferredAuth ? 'inferred' : 'none'

  // Collect evidence from all checks
  const evidence: SecurityEvidence[] = [
    checkCVEs(advisories, npmPackage, pipPackage),
    checkToolSafety(tools, effectiveAuth),
    poisoning,
    checkInjectionVectors(tools),
    stability.evidence,
    await checkDependencyHealth(npmPackage, pipPackage),
    checkLicense(license),
    checkAuth(effectiveAuth, authSource),
    checkRepoSignals(isArchived, securityVerified),
  ]

  const score = Math.max(0, Math.min(30,
    evidence.reduce((sum, e) => sum + e.points, 0)
  ))

  const openVulns = advisories.filter(a => a.status === 'open')

  return {
    score,
    evidence,
    cve_count: openVulns.length,
    advisories,
    has_authentication: effectiveAuth,
    scan_status: anyFailed ? 'failed' : hasPackageToScan ? 'success' : 'pending',
    has_tool_poisoning: poisoning.flags.length >= 2,
    tool_poisoning_flags: poisoning.flags,
    tool_definition_hash: stability.currentHash,
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
  score: number // 0-20
  total_tool_tokens: number
  estimated_tokens_per_call: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  tool_breakdown: Array<{ name: string; tokens: number }>
}

export function measureTokenEfficiency(tools: Tool[]): EfficiencyScanResult {
  // No tools = we can't measure efficiency, not "perfectly efficient"
  if (tools.length === 0) {
    return {
      score: 0,
      total_tool_tokens: 0,
      estimated_tokens_per_call: 0,
      grade: 'F',
      tool_breakdown: [],
    }
  }

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
  const avgPerCall = Math.round(totalTokens / tools.length) + 50

  // Grade based on total context cost
  let grade: EfficiencyScanResult['grade']
  let score: number

  if (totalTokens <= 500) {
    grade = 'A'; score = 20
  } else if (totalTokens <= 1500) {
    grade = 'B'; score = 16
  } else if (totalTokens <= 4000) {
    grade = 'C'; score = 12
  } else if (totalTokens <= 8000) {
    grade = 'D'; score = 6
  } else {
    grade = 'F'; score = 2
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
  score: number // 0-15
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

  result.score = Math.min(15, score)
  return result
}


// ============================================
// COMPATIBILITY — Transport + spec checks
// ============================================

export interface CompatScanResult {
  score: number // 0-10
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
  if (supportsStdio) score += 4    // stdio = works with most clients
  if (supportsHttp) score += 4     // http/sse = works remotely
  if (hasMultiple) score += 2      // multiple transports = flexible

  // Client compatibility (if explicitly listed)
  score += Math.min(compatibleClients.length * 2, 6)

  // If no clients listed but has tools, assume basic compatibility
  if (compatibleClients.length === 0 && tools.length > 0 && supportsStdio) {
    score += 3 // Reasonable assumption: stdio works with most clients
  }

  return {
    score: Math.min(10, score),
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
  score: number // 0-25 (unchanged)
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
