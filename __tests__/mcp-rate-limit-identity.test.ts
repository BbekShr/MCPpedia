import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * S36: the hosted `/mcp` endpoint calls `POST /api/mcp` over HTTPS, so every
 * user arrives from the same egress IP and shared one rate-limit bucket. The
 * fix forwards the real caller's IP (`x-mcppedia-client-ip`), trusted only
 * when it comes with a matching `MCP_INTERNAL_KEY`. These tests pin both
 * halves: `mcpApiCall` attaches the identity per async context, and the route
 * keys the limiter on it only for an authentic internal caller.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  rateLimitIp: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  getClientIp: vi.fn().mockReturnValue('9.9.9.9'),
}))

import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { POST as mcpPOST } from '@/app/api/mcp/route'
import { POST as hostedPOST } from '@/app/mcp/route'
import { mcpApiCall, runWithCallerIp } from '@/lib/mcp/api'

const EGRESS_IP = '9.9.9.9'
const KEY = 'internal-secret'

// An unknown action is rejected with 400 right after the rate-limit check, so
// the route never reaches Supabase and only the limiter key is under test.
function post(headers: Record<string, string> = {}): Promise<Response> {
  return mcpPOST(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action: 'nope', params: {} }),
    })
  )
}

function limiterKeys(): string[] {
  return vi.mocked(checkRateLimit).mock.calls.map(c => c[0])
}

beforeEach(() => {
  vi.mocked(checkRateLimit).mockClear()
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 10 })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/mcp rate-limit identity', () => {
  it('keys each forwarded client separately when the internal key matches', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    await post({ 'x-mcppedia-internal-key': KEY, 'x-mcppedia-client-ip': '1.1.1.1' })
    await post({ 'x-mcppedia-internal-key': KEY, 'x-mcppedia-client-ip': '2.2.2.2' })

    expect(limiterKeys()).toEqual(['mcp:1.1.1.1', 'mcp:2.2.2.2'])
    expect(limiterKeys()).not.toContain(`mcp:${EGRESS_IP}`)
  })

  it('ignores the forwarded IP when the key is wrong or missing', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    await post({ 'x-mcppedia-internal-key': 'wrong', 'x-mcppedia-client-ip': '1.1.1.1' })
    await post({ 'x-mcppedia-client-ip': '2.2.2.2' })
    await post({ 'x-mcppedia-internal-key': KEY }) // key without an IP

    expect(limiterKeys()).toEqual([`mcp:${EGRESS_IP}`, `mcp:${EGRESS_IP}`, `mcp:${EGRESS_IP}`])
  })

  it('trusts nothing when MCP_INTERNAL_KEY is unset, even if both headers are sent', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', '')
    await post({ 'x-mcppedia-internal-key': 'anything', 'x-mcppedia-client-ip': '1.1.1.1' })
    // An empty presented key must not "match" an unset secret either.
    await post({ 'x-mcppedia-internal-key': '', 'x-mcppedia-client-ip': '2.2.2.2' })
    delete process.env.MCP_INTERNAL_KEY
    await post({ 'x-mcppedia-internal-key': 'undefined', 'x-mcppedia-client-ip': '3.3.3.3' })

    expect(limiterKeys()).toEqual([`mcp:${EGRESS_IP}`, `mcp:${EGRESS_IP}`, `mcp:${EGRESS_IP}`])
  })

  it('exhausts one forwarded client without throttling another', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    // Stateful stand-in for the Supabase-backed limiter: fixed limit per key.
    const counts = new Map<string, number>()
    vi.mocked(checkRateLimit).mockImplementation(async (key: string, limit: number) => {
      const n = (counts.get(key) ?? 0) + 1
      counts.set(key, n)
      return n > limit
        ? { allowed: false, remaining: 0, retryAfter: 30 }
        : { allowed: true, remaining: limit - n }
    })
    const as = (ip: string) => post({ 'x-mcppedia-internal-key': KEY, 'x-mcppedia-client-ip': ip })

    for (let i = 0; i < 60; i++) expect((await as('1.1.1.1')).status).toBe(400)
    const throttled = await as('1.1.1.1')
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('Retry-After')).toBe('30')

    // B is a different bucket and is unaffected by A's exhaustion.
    expect((await as('2.2.2.2')).status).toBe(400)
  })
})

describe('POST /api/mcp forwarded IP normalisation', () => {
  it('trims whitespace and caps the forwarded IP at 64 chars', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    await post({ 'x-mcppedia-internal-key': KEY, 'x-mcppedia-client-ip': '  1.1.1.1  ' })
    await post({ 'x-mcppedia-internal-key': KEY, 'x-mcppedia-client-ip': 'a'.repeat(100) })

    expect(limiterKeys()).toEqual(['mcp:1.1.1.1', `mcp:${'a'.repeat(64)}`])
  })
})

describe('mcpApiCall caller identity propagation', () => {
  function stubFetch() {
    const sent: Headers[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(new Headers(init.headers))
        // Yield so concurrent contexts interleave inside the call.
        await new Promise(r => setTimeout(r, 0))
        return new Response(JSON.stringify({ data: {} }), { status: 200 })
      })
    )
    return sent
  }

  it('keeps concurrent callers isolated', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    const sent = stubFetch()

    // Distinct params per call defeat mcpApiCall's in-process response cache.
    const call = (ip: string, tag: string) =>
      runWithCallerIp(ip, async () => {
        await new Promise(r => setTimeout(r, 0))
        await mcpApiCall('search', { query: `iso-${tag}` })
      })
    await Promise.all([call('1.1.1.1', 'a'), call('2.2.2.2', 'b'), call('3.3.3.3', 'c')])

    expect(sent.map(h => h.get('x-mcppedia-client-ip')).sort()).toEqual(['1.1.1.1', '2.2.2.2', '3.3.3.3'])
    for (const h of sent) expect(h.get('x-mcppedia-internal-key')).toBe(KEY)
  })

  it('sends no identity headers when MCP_INTERNAL_KEY is unset or there is no caller', async () => {
    const sent = stubFetch()

    vi.stubEnv('MCP_INTERNAL_KEY', '')
    await runWithCallerIp('1.1.1.1', () => mcpApiCall('search', { query: 'nokey' }))

    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    await mcpApiCall('search', { query: 'nocaller' })

    expect(sent).toHaveLength(2)
    for (const h of sent) {
      expect(h.get('x-mcppedia-client-ip')).toBeNull()
      expect(h.get('x-mcppedia-internal-key')).toBeNull()
    }
  })
})

describe('end to end: caller identity survives the hop into /api/mcp', () => {
  it('a header renamed on only one side breaks the limiter key', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    // Pipe mcpApiCall's outbound request straight into the real route handler.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) =>
        mcpPOST(
          new Request(`https://x${new URL(url).pathname}`, {
            method: 'POST',
            headers: init.headers,
            body: init.body as string,
          })
        )
      )
    )

    await runWithCallerIp('1.1.1.1', () => mcpApiCall('nope-e2e-a', {}))
    await runWithCallerIp('2.2.2.2', () => mcpApiCall('nope-e2e-b', {}))

    expect(limiterKeys()).toEqual(['mcp:1.1.1.1', 'mcp:2.2.2.2'])
  })
})

describe('hosted /mcp route wiring', () => {
  it('forwards each request\'s own client IP on the tool call it triggers', async () => {
    vi.stubEnv('MCP_INTERNAL_KEY', KEY)
    const sent: Headers[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(new Headers(init.headers))
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      })
    )

    const rpc = (ip: string, query: string) => {
      vi.mocked(getClientIp).mockReturnValueOnce(ip)
      return hostedPOST(
        new Request('https://x/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'search_servers', arguments: { query } },
          }),
        })
      )
    }

    const a = await rpc('1.1.1.1', 'hosted-a')
    const b = await rpc('2.2.2.2', 'hosted-b')
    await a.text()
    await b.text()

    expect(sent.map(h => h.get('x-mcppedia-client-ip'))).toEqual(['1.1.1.1', '2.2.2.2'])
  })
})
