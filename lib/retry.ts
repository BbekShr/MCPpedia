/**
 * Retry an async function a few times with exponential backoff.
 *
 * Built for the cached data fetches behind `force-dynamic` pages (home,
 * security): those intentionally THROW on a Supabase error so `unstable_cache`
 * refuses to pin a hollow snapshot. The downside is that a single transient
 * blip (cold pooled connection, statement timeout, brief network hiccup) on a
 * cache-miss request bubbles straight to the error boundary — the user sees
 * "Something went wrong" and a reload fixes it. Wrapping the fetch in a couple
 * of retries absorbs those blips before giving up, while still rethrowing on a
 * persistent failure so the don't-cache-empty guarantee is preserved.
 *
 * Keep retries INSIDE the cached function so only the final result is cached —
 * the intermediate failed attempts are not.
 */
/**
 * Reject if `promise` has not settled within `ms`.
 *
 * For build-time fetches, a SLOW success is as fatal as a throw: Next gives each
 * route 60s per static-export attempt, and a fetch that returns at 80s fails the
 * route — and with it the production deploy — no matter how well the caller
 * handles errors. Racing a deadline converts that into an ordinary rejection the
 * caller can degrade on. Wrap the retry, not the attempt: a deadline inside
 * `withRetry` is multiplied by the retry count.
 *
 * The timer is unref'd so a pending deadline never keeps the build process alive.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms)
    timer.unref?.()
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 250

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries) break
      // 250ms, 500ms, 1000ms — short enough to stay within request budget.
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastErr
}
