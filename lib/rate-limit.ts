/**
 * In-memory sliding window rate limiter.
 * Sufficient for single-instance deployments. Resets on server restart.
 */

const store = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1 }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count }
}

/**
 * Rate limit by user ID for authenticated endpoints.
 */
export function rateLimitUser(userId: string, action: string, limit = 30, windowMs = 60_000): RateLimitResult {
  return checkRateLimit(`user:${userId}:${action}`, limit, windowMs)
}

/**
 * Rate limit by IP for unauthenticated endpoints.
 */
export function rateLimitIp(ip: string, action: string, limit = 10, windowMs = 60_000): RateLimitResult {
  return checkRateLimit(`ip:${ip}:${action}`, limit, windowMs)
}
