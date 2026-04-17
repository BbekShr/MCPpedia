import { describe, it, expect, vi, beforeEach } from 'vitest'

// The rate limiter now delegates to Supabase. We mock the admin client so the
// unit tests can verify the JS wrapper's behavior without needing a live DB.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { checkRateLimit, rateLimitUser, rateLimitIp, getClientIp } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

function mockRpc(response: { data?: unknown; error?: unknown }) {
  vi.mocked(createAdminClient).mockReturnValue({
    rpc: vi.fn().mockResolvedValue(response),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

describe('checkRateLimit', () => {
  it('returns allowed when RPC says so', async () => {
    mockRpc({ data: { allowed: true, remaining: 2 } })
    const r = await checkRateLimit('k', 3, 60_000)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
  })

  it('returns blocked with retryAfter when RPC denies', async () => {
    mockRpc({ data: { allowed: false, remaining: 0, retry_after: 42 } })
    const r = await checkRateLimit('k', 3, 60_000)
    expect(r.allowed).toBe(false)
    expect(r.retryAfter).toBe(42)
  })

  it('falls open if RPC errors (do not take site down on DB hiccup)', async () => {
    mockRpc({ error: { message: 'boom' } })
    const r = await checkRateLimit('k', 3, 60_000)
    expect(r.allowed).toBe(true)
  })

  it('falls open if service role key is missing (local dev)', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const r = await checkRateLimit('k', 3, 60_000)
    expect(r.allowed).toBe(true)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('rateLimitUser', () => {
  it('namespaces by user and action', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 9 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as any)
    await rateLimitUser('user-1', 'vote', 10, 60_000)
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', expect.objectContaining({
      p_key: 'user:user-1:vote',
      p_limit: 10,
      p_window_ms: 60_000,
    }))
  })
})

describe('rateLimitIp', () => {
  it('namespaces by ip and action', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, remaining: 9 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as any)
    await rateLimitIp('1.2.3.4', 'search', 30, 60_000)
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', expect.objectContaining({
      p_key: 'ip:1.2.3.4:search',
      p_limit: 30,
    }))
  })
})

describe('getClientIp', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('https://example.com/', { headers })
  }

  it('prefers x-vercel-forwarded-for (Vercel-signed, not spoofable)', () => {
    expect(getClientIp(req({
      'x-vercel-forwarded-for': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
      'x-real-ip': '3.3.3.3',
    }))).toBe('1.1.1.1')
  })

  it('falls back to x-forwarded-for if x-vercel-forwarded-for missing', () => {
    expect(getClientIp(req({
      'x-forwarded-for': '2.2.2.2, 10.0.0.1',
      'x-real-ip': '3.3.3.3',
    }))).toBe('2.2.2.2')
  })

  it('falls back to x-real-ip last (easily spoofed)', () => {
    expect(getClientIp(req({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3')
  })

  it('returns unknown when no headers present', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})
