'use client'

import { useState } from 'react'
import type { Server } from '@/lib/types'

type TestStatus = 'idle' | 'testing' | 'pass' | 'fail' | 'error'

interface TestResult {
  status: TestStatus
  message: string
  tools_found?: number
  response_time_ms?: number
  mcp_version?: string
}

export default function ServerTester({ server }: { server: Server }) {
  const [result, setResult] = useState<TestResult>({ status: 'idle', message: '' })
  const [reported, setReported] = useState(false)

  const isHttp = server.transport?.includes('http') || server.transport?.includes('sse')
  const hasHomepage = server.homepage_url && (
    server.homepage_url.startsWith('http://') || server.homepage_url.startsWith('https://')
  )

  // Generate the test command for stdio servers
  const testCommand = server.npm_package
    ? `npx -y ${server.npm_package} 2>&1 | head -1 && echo "✓ Server started successfully"`
    : server.pip_package
      ? `uvx ${server.pip_package} 2>&1 | head -1 && echo "✓ Server started successfully"`
      : null

  // For HTTP servers, test from the browser
  async function testHttpServer() {
    if (!hasHomepage) return
    setResult({ status: 'testing', message: 'Connecting...' })

    const startTime = Date.now()

    try {
      // Try to reach the server's endpoint
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(server.homepage_url!, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors', // Most MCP servers won't have CORS headers
      })

      clearTimeout(timeout)
      const responseTime = Date.now() - startTime

      // no-cors means we can't read the response, but if we get here it means the server responded
      setResult({
        status: 'pass',
        message: `Server responded in ${responseTime}ms`,
        response_time_ms: responseTime,
      })
    } catch (err) {
      const responseTime = Date.now() - startTime
      const message = err instanceof DOMException && err.name === 'AbortError'
        ? 'Connection timed out (10s)'
        : `Could not reach server: ${(err as Error).message}`

      setResult({
        status: responseTime > 10000 ? 'fail' : 'error',
        message,
        response_time_ms: responseTime,
      })
    }
  }

  // Report result back to MCPpedia
  async function reportResult() {
    try {
      await fetch('/api/health-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: server.id,
          status: result.status,
          response_time_ms: result.response_time_ms,
          transport: isHttp ? 'http' : 'stdio',
          source: 'user-test',
        }),
      })
      setReported(true)
    } catch {
      // Silent fail — reporting is optional
    }
  }

  const [copied, setCopied] = useState(false)

  async function copyCommand() {
    if (!testCommand) return
    await navigator.clipboard.writeText(testCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusColors: Record<TestStatus, string> = {
    idle: 'border-border',
    testing: 'border-accent',
    pass: 'border-green',
    fail: 'border-red',
    error: 'border-yellow',
  }

  return (
    <div className={`border rounded-md p-4 transition-colors ${statusColors[result.status]}`}>
      <h3 className="font-semibold text-text-primary mb-3">Test This Server</h3>

      {isHttp && hasHomepage ? (
        /* HTTP server — test from browser */
        <div>
          <p className="text-sm text-text-muted mb-3">
            This server supports HTTP transport. Test if it&apos;s reachable right now.
          </p>
          <button
            onClick={testHttpServer}
            disabled={result.status === 'testing'}
            className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {result.status === 'testing' ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Testing...
              </span>
            ) : (
              'Test connection'
            )}
          </button>
        </div>
      ) : testCommand ? (
        /* Stdio server — show copy-paste command */
        <div>
          <p className="text-sm text-text-muted mb-3">
            Run this in your terminal to test if the server starts:
          </p>
          <div className="relative">
            <pre className="bg-code-bg border border-border rounded-md p-3 text-sm font-mono overflow-x-auto">
              {testCommand}
            </pre>
            <button
              onClick={copyCommand}
              className="absolute top-2 right-2 px-2 py-1 text-xs rounded border border-border bg-bg hover:bg-bg-tertiary text-text-muted"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">
            After testing, let us know if it worked:
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setResult({ status: 'pass', message: 'User reported: working' }); }}
              className="px-3 py-1.5 text-xs rounded-md border border-green text-green hover:bg-green/5 transition-colors"
            >
              It worked
            </button>
            <button
              onClick={() => { setResult({ status: 'fail', message: 'User reported: not working' }); }}
              className="px-3 py-1.5 text-xs rounded-md border border-red text-red hover:bg-red/5 transition-colors"
            >
              It failed
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          No automated test available for this server. Check the{' '}
          {server.github_url ? (
            <a href={server.github_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
              GitHub README
            </a>
          ) : (
            'documentation'
          )}{' '}
          for setup instructions.
        </p>
      )}

      {/* Result display */}
      {result.status !== 'idle' && result.status !== 'testing' && (
        <div className={`mt-3 p-3 rounded-md text-sm ${
          result.status === 'pass' ? 'bg-green/5 text-green' :
          result.status === 'fail' ? 'bg-red/5 text-red' :
          'bg-yellow/5 text-yellow'
        }`}>
          <div className="flex items-center gap-2">
            <span>{result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠'}</span>
            <span>{result.message}</span>
          </div>
          {result.response_time_ms && (
            <span className="text-xs opacity-75 ml-5">Response time: {result.response_time_ms}ms</span>
          )}

          {/* Report button */}
          {!reported ? (
            <button
              onClick={reportResult}
              className="mt-2 text-xs underline opacity-75 hover:opacity-100"
            >
              Report this result to MCPpedia
            </button>
          ) : (
            <p className="mt-2 text-xs opacity-75">Thanks! Result reported.</p>
          )}
        </div>
      )}
    </div>
  )
}
