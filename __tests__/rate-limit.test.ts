import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, rateLimitUser, rateLimitIp } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  it('allows requests within limit', () => {
    const key = `test-allow-${Date.now()}`
    const r1 = checkRateLimit(key, 3, 60_000)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)

    const r2 = checkRateLimit(key, 3, 60_000)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = checkRateLimit(key, 3, 60_000)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('blocks requests exceeding limit', () => {
    const key = `test-block-${Date.now()}`
    checkRateLimit(key, 2, 60_000)
    checkRateLimit(key, 2, 60_000)
    const r3 = checkRateLimit(key, 2, 60_000)
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
    expect(r3.retryAfter).toBeGreaterThan(0)
  })

  it('uses separate windows per key', () => {
    const key1 = `test-sep-a-${Date.now()}`
    const key2 = `test-sep-b-${Date.now()}`
    checkRateLimit(key1, 1, 60_000)
    // key1 is exhausted, but key2 should be independent
    const r = checkRateLimit(key2, 1, 60_000)
    expect(r.allowed).toBe(true)
  })
})

describe('rateLimitUser', () => {
  it('namespaces by user and action', () => {
    const r1 = rateLimitUser('user-1', 'test-action', 1, 60_000)
    expect(r1.allowed).toBe(true)

    // Same user, same action — blocked
    const r2 = rateLimitUser('user-1', 'test-action', 1, 60_000)
    expect(r2.allowed).toBe(false)

    // Different user, same action — allowed
    const r3 = rateLimitUser('user-2', 'test-action', 1, 60_000)
    expect(r3.allowed).toBe(true)

    // Same user, different action — allowed
    const r4 = rateLimitUser('user-1', 'other-action', 1, 60_000)
    expect(r4.allowed).toBe(true)
  })
})

describe('rateLimitIp', () => {
  it('namespaces by ip and action', () => {
    const r1 = rateLimitIp('1.2.3.4', 'test-ip-action', 1, 60_000)
    expect(r1.allowed).toBe(true)

    const r2 = rateLimitIp('1.2.3.4', 'test-ip-action', 1, 60_000)
    expect(r2.allowed).toBe(false)

    // Different IP — allowed
    const r3 = rateLimitIp('5.6.7.8', 'test-ip-action', 1, 60_000)
    expect(r3.allowed).toBe(true)
  })
})
