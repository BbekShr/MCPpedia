/**
 * Rate limiter backed by Supabase. The previous implementation used an
 * in-memory Map which was useless on Vercel — each lambda instance had its
 * own counter, so limits scaled with fleet size.
 *
 * This version calls the atomic `check_rate_limit` RPC defined in
 * supabase/migrations/20260417155046_rate_limits.sql. Counters are shared
 * across all instances and survive restarts.
 *
 * Fall-open: if Supabase is unreachable or the RPC errors, we allow the
 * request. Denying on infra failure would take the site down whenever the
 * DB hiccups; logging and allowing is the safer trade-off for an abuse
 * mitigation (not a hard security boundary).
 */

import { createAdminClient } from './supabase/admin'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  // If service role isn't configured (local dev without secrets), fall open
  // rather than crash the route.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: true, remaining: limit - 1 }
  }

  try {
    const supabase = createAdminClient('rate-limit')
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    })

    if (error) {
      console.error('rate-limit rpc error:', error.message)
      return { allowed: true, remaining: limit - 1 }
    }

    const result = data as { allowed: boolean; remaining: number; retry_after?: number }
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      retryAfter: result.retry_after,
    }
  } catch (err) {
    console.error('rate-limit unexpected error:', err)
    return { allowed: true, remaining: limit - 1 }
  }
}

/**
 * Rate limit by user ID for authenticated endpoints.
 */
export function rateLimitUser(userId: string, action: string, limit = 30, windowMs = 60_000): Promise<RateLimitResult> {
  return checkRateLimit(`user:${userId}:${action}`, limit, windowMs)
}

/**
 * Rate limit by IP for unauthenticated endpoints.
 */
export function rateLimitIp(ip: string, action: string, limit = 10, windowMs = 60_000): Promise<RateLimitResult> {
  return checkRateLimit(`ip:${ip}:${action}`, limit, windowMs)
}

/**
 * Extract the client IP from request headers. On Vercel, `x-vercel-forwarded-for`
 * is set by Vercel's edge (not user-settable) so we prefer it. Otherwise we fall
 * back to the leftmost value of `x-forwarded-for` and then `x-real-ip`. `x-real-ip`
 * is easily spoofed on non-Vercel deployments, so it is the last choice.
 */
export function getClientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0].trim()

  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()

  return req.headers.get('x-real-ip') || 'unknown'
}
