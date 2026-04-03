/**
 * Verify Quick Install configs are correct and functional.
 *
 * Three verification layers:
 *   Layer 1 — Structural validation (fast, no network)
 *   Layer 2 — Package registry checks (npm/PyPI)
 *   Layer 3 — Runtime smoke test (optional, --runtime flag)
 *
 * Usage:
 *   npx tsx scripts/verify-configs.ts [--runtime] [--slug <slug>] [--json]
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// --- Types ---

type Severity = 'error' | 'warning' | 'info'

interface Issue {
  serverSlug: string
  layer: 1 | 2 | 3
  severity: Severity
  code: string
  message: string
}

interface Report {
  timestamp: string
  totalServers: number
  serversChecked: number
  summary: { pass: number; warn: number; fail: number; skip: number }
  issues: Issue[]
}

interface McpEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

// --- CLI args ---

const args = process.argv.slice(2)
const flagRuntime = args.includes('--runtime')
const flagJson = args.includes('--json')
const slugIdx = args.indexOf('--slug')
const filterSlug = slugIdx !== -1 ? args[slugIdx + 1] : null

const VALID_COMMANDS = ['npx', 'uvx', 'node', 'python', 'python3', 'docker', 'pip', 'pip3']

// --- Layer 1: Structural validation ---

function validateStructure(slug: string, installConfigs: Record<string, unknown>): Issue[] {
  const issues: Issue[] = []
  const knownClients = ['claude-desktop', 'cursor', 'claude-code', 'windsurf', 'other']

  const clientKeys = Object.keys(installConfigs)
  if (clientKeys.length === 0) return issues

  // Check for unknown client keys
  for (const key of clientKeys) {
    if (!knownClients.includes(key)) {
      issues.push({ serverSlug: slug, layer: 1, severity: 'warning', code: 'UNKNOWN_CLIENT_KEY', message: `Unknown client key "${key}"` })
    }
  }

  // Check if only claude-desktop is present
  if (clientKeys.length === 1 && clientKeys[0] === 'claude-desktop') {
    issues.push({ serverSlug: slug, layer: 1, severity: 'info', code: 'ONLY_CLAUDE_DESKTOP', message: 'Config only stored for claude-desktop; other clients are auto-generated at render time' })
  }

  // Validate each client config
  for (const client of clientKeys) {
    const clientConfig = installConfigs[client] as Record<string, unknown> | undefined
    if (!clientConfig) continue

    const mcpServers = clientConfig.mcpServers as Record<string, McpEntry> | undefined
    if (!mcpServers) {
      issues.push({ serverSlug: slug, layer: 1, severity: 'error', code: 'MISSING_MCP_SERVERS', message: `${client}: missing "mcpServers" wrapper` })
      continue
    }

    const serverKeys = Object.keys(mcpServers)
    if (serverKeys.length === 0) {
      issues.push({ serverSlug: slug, layer: 1, severity: 'error', code: 'EMPTY_MCP_SERVERS', message: `${client}: "mcpServers" is empty` })
      continue
    }

    for (const serverKey of serverKeys) {
      const entry = mcpServers[serverKey]

      // URL-based config (remote transport)
      if (entry.url) {
        if (!entry.url.startsWith('https://')) {
          issues.push({ serverSlug: slug, layer: 1, severity: 'warning', code: 'INSECURE_URL', message: `${client}/${serverKey}: URL is not HTTPS` })
        }
        continue
      }

      // Command-based config
      if (!entry.command) {
        issues.push({ serverSlug: slug, layer: 1, severity: 'error', code: 'MISSING_COMMAND', message: `${client}/${serverKey}: no "command" or "url"` })
        continue
      }

      if (!VALID_COMMANDS.includes(entry.command)) {
        issues.push({ serverSlug: slug, layer: 1, severity: 'error', code: 'INVALID_COMMAND', message: `${client}/${serverKey}: unknown command "${entry.command}"` })
      }

      if (!entry.args || !Array.isArray(entry.args) || entry.args.length === 0) {
        issues.push({ serverSlug: slug, layer: 1, severity: 'error', code: 'EMPTY_ARGS', message: `${client}/${serverKey}: "args" is missing or empty` })
        continue
      }

      // npx without -y will prompt interactively
      if (entry.command === 'npx' && !entry.args.includes('-y')) {
        // Check if the package has @version pinned (npx won't prompt if version is pinned)
        const pkg = entry.args.find((a: string) => !a.startsWith('-'))
        const hasPinnedVersion = pkg && /@[\d.]/.test(pkg) && !pkg.endsWith('@latest')
        if (!hasPinnedVersion) {
          issues.push({ serverSlug: slug, layer: 1, severity: 'warning', code: 'MISSING_DASH_Y', message: `${client}/${serverKey}: npx without -y flag may prompt interactively` })
        }
      }

      // Check env values are strings
      if (entry.env) {
        for (const [k, v] of Object.entries(entry.env)) {
          if (typeof v !== 'string') {
            issues.push({ serverSlug: slug, layer: 1, severity: 'error', code: 'INVALID_ENV', message: `${client}/${serverKey}: env.${k} is not a string` })
          }
        }
      }
    }
  }

  return issues
}

// --- Layer 2: Package verification ---

async function checkNpmPackage(pkg: string): Promise<{ exists: boolean; isMcp: boolean; deprecated: boolean; error?: string }> {
  // Strip version suffix for registry lookup
  const basePkg = pkg.replace(/@(latest|[\d.]+.*)$/, '')
  try {
    const encoded = basePkg.startsWith('@') ? `@${encodeURIComponent(basePkg.slice(1))}` : encodeURIComponent(basePkg)
    const res = await fetch(`https://registry.npmjs.org/${encoded}`)
    if (!res.ok) return { exists: false, isMcp: false, deprecated: false, error: `HTTP ${res.status}` }

    const data = await res.json() as Record<string, unknown>
    const keywords = (data.keywords as string[]) || []
    const desc = ((data.description as string) || '').toLowerCase()
    const name = (data.name as string) || ''

    const isMcp = keywords.some(k => ['mcp', 'model-context-protocol', 'mcp-server'].includes(k.toLowerCase()))
      || desc.includes('mcp') || desc.includes('model context protocol')
      || name.includes('mcp')

    // Check if latest version is deprecated
    const distTags = data['dist-tags'] as Record<string, string> | undefined
    const latestVer = distTags?.latest
    const versions = data.versions as Record<string, Record<string, unknown>> | undefined
    const deprecated = !!(latestVer && versions?.[latestVer]?.deprecated)

    return { exists: true, isMcp, deprecated }
  } catch (err) {
    return { exists: false, isMcp: false, deprecated: false, error: String(err) }
  }
}

async function checkPypiPackage(pkg: string): Promise<{ exists: boolean; isMcp: boolean }> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`)
    if (!res.ok) return { exists: false, isMcp: false }

    const data = await res.json() as Record<string, unknown>
    const info = data.info as Record<string, unknown> | undefined
    const desc = ((info?.summary as string) || '').toLowerCase()
    const keywords = ((info?.keywords as string) || '').toLowerCase()
    const name = (info?.name as string) || ''

    const isMcp = desc.includes('mcp') || desc.includes('model context protocol')
      || keywords.includes('mcp') || name.includes('mcp')

    return { exists: true, isMcp }
  } catch {
    return { exists: false, isMcp: false }
  }
}

function extractPackageFromArgs(command: string, cmdArgs: string[]): string | null {
  if (command === 'npx') {
    // Find first arg that isn't a flag or 'mcp-remote'
    return cmdArgs.find(a => !a.startsWith('-') && a !== 'mcp-remote') || null
  }
  if (command === 'uvx') {
    return cmdArgs.find(a => !a.startsWith('-')) || null
  }
  return null
}

async function verifyPackages(
  slug: string,
  installConfigs: Record<string, unknown>,
  dbNpmPackage: string | null,
  dbPipPackage: string | null
): Promise<Issue[]> {
  const issues: Issue[] = []

  // Get the first client config to check (they're usually all the same)
  const firstClient = Object.keys(installConfigs)[0]
  if (!firstClient) return issues

  const clientConfig = installConfigs[firstClient] as Record<string, unknown>
  const mcpServers = clientConfig?.mcpServers as Record<string, McpEntry> | undefined
  if (!mcpServers) return issues

  const firstKey = Object.keys(mcpServers)[0]
  const entry = mcpServers[firstKey]
  if (!entry?.command || !entry?.args) return issues

  const pkg = extractPackageFromArgs(entry.command, entry.args)
  if (!pkg) return issues

  // npm package check
  if (entry.command === 'npx') {
    // Check for redundant @latest
    if (pkg.endsWith('@latest')) {
      issues.push({ serverSlug: slug, layer: 2, severity: 'info', code: 'REDUNDANT_LATEST_TAG', message: `"${pkg}" — @latest is redundant for npx (it always fetches latest)` })
    }

    const result = await checkNpmPackage(pkg)
    if (!result.exists) {
      issues.push({ serverSlug: slug, layer: 2, severity: 'error', code: 'NPM_NOT_FOUND', message: `npm package "${pkg}" not found${result.error ? ` (${result.error})` : ''}` })
    } else {
      if (!result.isMcp) {
        issues.push({ serverSlug: slug, layer: 2, severity: 'warning', code: 'POSSIBLY_NOT_MCP', message: `npm package "${pkg}" exists but has no MCP keywords/signals` })
      }
      if (result.deprecated) {
        issues.push({ serverSlug: slug, layer: 2, severity: 'warning', code: 'NPM_DEPRECATED', message: `npm package "${pkg}" latest version is deprecated` })
      }
    }

    // Check mismatch with DB column
    const basePkg = pkg.replace(/@(latest|[\d.]+.*)$/, '')
    if (dbNpmPackage && dbNpmPackage !== basePkg && dbNpmPackage !== pkg) {
      issues.push({ serverSlug: slug, layer: 2, severity: 'warning', code: 'PACKAGE_MISMATCH', message: `Config uses "${pkg}" but servers.npm_package is "${dbNpmPackage}"` })
    }
  }

  // pip/uvx package check
  if (entry.command === 'uvx' || entry.command === 'pip' || entry.command === 'pip3') {
    const result = await checkPypiPackage(pkg)
    if (!result.exists) {
      issues.push({ serverSlug: slug, layer: 2, severity: 'error', code: 'PYPI_NOT_FOUND', message: `PyPI package "${pkg}" not found` })
    } else if (!result.isMcp) {
      issues.push({ serverSlug: slug, layer: 2, severity: 'warning', code: 'POSSIBLY_NOT_MCP', message: `PyPI package "${pkg}" exists but has no MCP keywords/signals` })
    }

    if (dbPipPackage && dbPipPackage !== pkg) {
      issues.push({ serverSlug: slug, layer: 2, severity: 'warning', code: 'PACKAGE_MISMATCH', message: `Config uses "${pkg}" but servers.pip_package is "${dbPipPackage}"` })
    }
  }

  return issues
}

// --- Layer 3: Runtime smoke test ---

async function runtimeTest(slug: string, command: string, cmdArgs: string[]): Promise<Issue[]> {
  const issues: Issue[] = []

  return new Promise<Issue[]>((resolve) => {
    const timeout = 15_000
    let stdout = ''
    let stderr = ''
    let resolved = false

    const finish = () => {
      if (resolved) return
      resolved = true

      // Check if we got a valid JSON-RPC response
      const lines = stdout.split('\n').filter(l => l.trim())
      let gotInitResponse = false

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.jsonrpc === '2.0' && parsed.id === 1 && parsed.result) {
            gotInitResponse = true
            // Check for expected fields
            if (parsed.result.protocolVersion) {
              // Valid MCP server!
            }
            if (parsed.result.capabilities?.tools) {
              // Server supports tools
            }
          }
        } catch {
          // Not JSON — might be a log line
        }
      }

      if (gotInitResponse) {
        // Success — no issues to report
      } else if (stdout.length === 0 && stderr.length > 0) {
        issues.push({
          serverSlug: slug, layer: 3, severity: 'error', code: 'RUNTIME_FAIL_TO_START',
          message: `Server failed to start: ${stderr.slice(0, 200)}`
        })
      } else {
        issues.push({
          serverSlug: slug, layer: 3, severity: 'warning', code: 'RUNTIME_NO_INIT_RESPONSE',
          message: `No valid initialize response. stdout: ${stdout.slice(0, 200)}`
        })
      }

      resolve(issues)
    }

    try {
      // Ensure -y is in args for npx
      const spawnArgs = [...cmdArgs]
      if (command === 'npx' && !spawnArgs.includes('-y')) {
        spawnArgs.unshift('-y')
      }

      const proc = spawn(command, spawnArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' },
        timeout,
      })

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('error', (err) => {
        issues.push({
          serverSlug: slug, layer: 3, severity: 'error', code: 'RUNTIME_SPAWN_ERROR',
          message: `Failed to spawn: ${err.message}`
        })
        resolve(issues)
      })

      proc.on('close', () => finish())

      // Send initialize request
      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'mcppedia-verifier', version: '0.1.0' }
        }
      })

      // Wait a moment for the process to start, then send
      setTimeout(() => {
        try {
          proc.stdin.write(initRequest + '\n')
        } catch {
          // stdin might be closed already
        }
      }, 1000)

      // Kill after timeout
      setTimeout(() => {
        try { proc.kill('SIGTERM') } catch { /* already dead */ }
        setTimeout(finish, 500)
      }, timeout - 1000)

    } catch (err) {
      issues.push({
        serverSlug: slug, layer: 3, severity: 'error', code: 'RUNTIME_SPAWN_ERROR',
        message: `Spawn error: ${String(err)}`
      })
      resolve(issues)
    }
  })
}

// --- Main ---

async function main() {
  const report: Report = {
    timestamp: new Date().toISOString(),
    totalServers: 0,
    serversChecked: 0,
    summary: { pass: 0, warn: 0, fail: 0, skip: 0 },
    issues: [],
  }

  if (!flagJson) console.log('=== MCPpedia Config Verifier ===\n')

  // Fetch servers
  let query = supabase
    .from('servers')
    .select('id, slug, name, npm_package, pip_package, install_configs, transport, requires_api_key')

  if (filterSlug) {
    query = query.eq('slug', filterSlug)
  }

  const { data: servers, error } = await query

  if (error) {
    console.error('DB error:', error.message)
    process.exit(1)
  }
  if (!servers || servers.length === 0) {
    console.log(filterSlug ? `No server found with slug "${filterSlug}"` : 'No servers found')
    process.exit(0)
  }

  report.totalServers = servers.length

  const withConfigs = servers.filter(srv => {
    const c = srv.install_configs as Record<string, unknown>
    return c && JSON.stringify(c) !== '{}'
  })

  if (!flagJson) {
    console.log(`Total servers: ${servers.length}`)
    console.log(`With install configs: ${withConfigs.length}`)
    if (flagRuntime) console.log('Runtime tests: ENABLED')
    console.log('')
  }

  for (let i = 0; i < withConfigs.length; i++) {
    const srv = withConfigs[i]
    const configs = srv.install_configs as Record<string, unknown>
    const slug = srv.slug as string

    if (!flagJson) {
      process.stdout.write(`[${i + 1}/${withConfigs.length}] ${slug}...`)
    }

    const serverIssues: Issue[] = []

    // Layer 1: Structure
    serverIssues.push(...validateStructure(slug, configs))

    // Layer 2: Package verification
    try {
      const pkgIssues = await verifyPackages(slug, configs, srv.npm_package, srv.pip_package)
      serverIssues.push(...pkgIssues)
    } catch (err) {
      serverIssues.push({
        serverSlug: slug, layer: 2, severity: 'warning', code: 'REGISTRY_ERROR',
        message: `Registry check failed: ${String(err)}`
      })
    }

    // Layer 3: Runtime (optional)
    if (flagRuntime) {
      const firstClient = Object.keys(configs)[0]
      const clientConfig = configs[firstClient] as Record<string, unknown>
      const mcpServers = clientConfig?.mcpServers as Record<string, McpEntry> | undefined
      const firstKey = mcpServers ? Object.keys(mcpServers)[0] : null
      const entry = firstKey ? mcpServers![firstKey] : null

      if (srv.requires_api_key) {
        serverIssues.push({
          serverSlug: slug, layer: 3, severity: 'info', code: 'SKIPPED_NEEDS_API_KEY',
          message: 'Runtime test skipped — server requires an API key'
        })
      } else if (entry?.command && entry?.args) {
        const rtIssues = await runtimeTest(slug, entry.command, entry.args)
        serverIssues.push(...rtIssues)
      }
    }

    // Classify this server
    const hasError = serverIssues.some(i => i.severity === 'error')
    const hasWarn = serverIssues.some(i => i.severity === 'warning')

    if (hasError) report.summary.fail++
    else if (hasWarn) report.summary.warn++
    else report.summary.pass++

    report.issues.push(...serverIssues)
    report.serversChecked++

    if (!flagJson) {
      if (serverIssues.length === 0) {
        console.log(' PASS')
      } else {
        const errors = serverIssues.filter(i => i.severity === 'error')
        const warnings = serverIssues.filter(i => i.severity === 'warning')
        const infos = serverIssues.filter(i => i.severity === 'info')
        const parts: string[] = []
        if (errors.length) parts.push(`${errors.length} error(s)`)
        if (warnings.length) parts.push(`${warnings.length} warning(s)`)
        if (infos.length) parts.push(`${infos.length} info`)
        console.log(` ${parts.join(', ')}`)
        for (const issue of serverIssues) {
          const icon = issue.severity === 'error' ? 'ERR' : issue.severity === 'warning' ? 'WARN' : 'INFO'
          console.log(`    [${icon}] ${issue.code}: ${issue.message}`)
        }
      }
    }

    // Rate limit registry requests
    await new Promise(r => setTimeout(r, 150))
  }

  // Servers without configs
  const withoutConfigs = servers.length - withConfigs.length
  if (withoutConfigs > 0) {
    report.summary.skip += withoutConfigs
  }

  // Output
  if (flagJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('\n=== Summary ===')
    console.log(`Checked: ${report.serversChecked}`)
    console.log(`Pass: ${report.summary.pass}`)
    console.log(`Warnings: ${report.summary.warn}`)
    console.log(`Failures: ${report.summary.fail}`)
    console.log(`Skipped (no config): ${report.summary.skip}`)

    if (report.issues.filter(i => i.severity === 'error').length > 0) {
      console.log('\n=== Errors ===')
      for (const issue of report.issues.filter(i => i.severity === 'error')) {
        console.log(`  ${issue.serverSlug}: [${issue.code}] ${issue.message}`)
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
