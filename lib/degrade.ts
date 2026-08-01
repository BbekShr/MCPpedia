// Resolve to null instead of throwing when live data can't be fetched, so a
// page can render a degraded shell rather than falling through to the crash
// boundary in app/error.tsx.
//
// The time bound matters as much as the catch. The page fetchers retry with
// backoff (lib/retry.ts), which is the right call for a blip but means a hard
// outage leaves the user looking at nothing for ~15s before anything renders at
// all — that is what a restricted Supabase project looked like on 2026-07-25.
//
// Losing the race does NOT cancel the fetch, but do NOT count on a late success
// to heal the page. That only works on a long-lived Node server; on Vercel
// serverless the instance is frozen or reclaimed once the response is returned,
// so the in-flight fetch never completes, unstable_cache never receives a
// successful return, and the next request repeats the whole thing. That is why
// the degraded homepage persisted across every request on 2026-08-01 instead of
// healing after the first. Consequence: on a fetcher wrapped in unstable_cache
// the budget must be sized to let the fetch actually FINISH at least once —
// a budget shorter than the cold fetch is a permanent degrade, not a slow first
// request.
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
