import { createClient } from '@supabase/supabase-js'

/**
 * Creates a service-role Supabase client for bots and scripts.
 *
 * The `actorLabel` is sent as an `x-actor-label` request header on every call;
 * the server_changes audit trigger records it so we can trace field changes
 * back to the bot/script that made them. Required for accurate attribution.
 */
export function createAdminClient(actorLabel: string) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key, {
    global: { headers: { 'x-actor-label': actorLabel } },
  })
}

/**
 * Fetch all rows from a Supabase query builder, paginating through the
 * default 1000-row PostgREST limit automatically.
 *
 * Usage:
 *   const rows = await fetchAllRows<{ id: string; slug: string }>(
 *     supabase.from('servers').select('id, slug').eq('is_archived', false)
 *   )
 *
 * Build the query (filters, ordering) without `.range()` — this function
 * appends range() pages internally. Transient errors (statement timeout,
 * connection drops) are retried per page with exponential backoff — the
 * sync-registry bot was failing whole runs on a single 8s statement timeout
 * under DB load. Throws once retries are exhausted so callers fail loudly
 * rather than silently operating on a partial set.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(queryBuilder: any): Promise<T[]> {
  const PAGE_SIZE = 1000
  const MAX_ATTEMPTS = 4
  const out: T[] = []
  let from = 0

  while (true) {
    let data: T[] | null = null
    for (let attempt = 1; ; attempt++) {
      const { data: page, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1)
      if (!error) {
        data = page
        break
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`fetchAllRows error at offset ${from} after ${attempt} attempts: ${error.message}`)
      }
      const backoffMs = 2000 * 2 ** (attempt - 1) // 2s, 4s, 8s
      console.warn(`fetchAllRows: page at offset ${from} failed (${error.message}) — retrying in ${backoffMs / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS})`)
      await new Promise(r => setTimeout(r, backoffMs))
    }
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += data.length
  }

  return out
}
