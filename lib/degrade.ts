// Resolve to null instead of throwing when live data can't be fetched, so a
// page can render a degraded shell rather than falling through to the crash
// boundary in app/error.tsx.
//
// The time bound matters as much as the catch. The page fetchers retry with
// backoff (lib/retry.ts), which is the right call for a blip but means a hard
// outage leaves the user looking at nothing for ~15s before anything renders at
// all — that is what a restricted Supabase project looked like on 2026-07-25.
//
// Losing the race does NOT cancel the fetch. It keeps running, and since the
// callers wrap their fetchers in unstable_cache, a late success still populates
// the cache and the next request serves the real page. Nothing is thrown away.
//
// This does not weaken the "never cache an empty render" rule the fetchers
// enforce by throwing: the throw still happens inside unstable_cache, which
// only ever caches successful returns. The catch is out here, one level above.
export async function liveDataOrNull<T>(
  fetcher: () => Promise<T>,
  timeoutMs = 6000,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })

  try {
    return await Promise.race([
      fetcher().catch((err: unknown) => {
        console.error('[degrade] live data unavailable, rendering degraded shell', err)
        return null
      }),
      budget,
    ])
  } finally {
    clearTimeout(timer)
  }
}
