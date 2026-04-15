import { createServerClient } from '@supabase/ssr'

/**
 * Public read-only Supabase client for use in Server Components that render
 * publicly cached/ISR pages.
 *
 * IMPORTANT — SEO:
 * Do NOT use `lib/supabase/server.ts#createClient()` on pages that should be
 * indexed by search engines. That client reads `cookies()` from `next/headers`,
 * which forces Next.js into dynamic rendering and emits the response header
 * `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`.
 * Google treats `no-store` as a strong "do not index" signal — it caused
 * ~1k pages on mcppedia.org to drop out of the index.
 *
 * This client uses the public anon key with a no-op cookies adapter — it never
 * calls `next/headers#cookies()`, so pages stay statically generated /
 * ISR-cacheable and Vercel emits a proper public cache header.
 *
 * Use this for any page that:
 *   - Renders public catalog data (servers, categories, comparisons, guides)
 *   - Sets `export const revalidate = <seconds>`
 *   - Does NOT need to know who the visitor is during SSR
 *
 * Personalised UI (vote state, edit buttons, "my favorites") should be moved
 * into a Client Component that fetches via `/api/*` after hydration.
 *
 * The return type is identical to `lib/supabase/server.ts#createClient()`,
 * so existing query call-sites work unchanged — just swap the import and drop
 * the `await`.
 */
export function createPublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return createMockClient()
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      // No-op adapter — never touches next/headers#cookies(), so the page
      // is not promoted to dynamic rendering. Anonymous SSR reads only.
      getAll() {
        return []
      },
      setAll() {
        // no-op
      },
    },
  })
}

function createMockClient() {
  const emptyResponse = { data: null, error: null, count: null }
  const chainable = {
    select: () => chainable,
    insert: () => chainable,
    update: () => chainable,
    delete: () => chainable,
    eq: () => chainable,
    neq: () => chainable,
    gt: () => chainable,
    gte: () => chainable,
    lt: () => chainable,
    lte: () => chainable,
    contains: () => chainable,
    overlaps: () => chainable,
    is: () => chainable,
    or: () => chainable,
    ilike: () => chainable,
    in: () => chainable,
    not: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    range: () => chainable,
    single: () => Promise.resolve(emptyResponse),
    maybeSingle: () => Promise.resolve(emptyResponse),
    then: (resolve: (value: typeof emptyResponse) => void) =>
      Promise.resolve(emptyResponse).then(resolve),
  }
  return {
    from: () => chainable,
    rpc: () => Promise.resolve(emptyResponse),
  } as unknown as ReturnType<typeof createServerClient>
}
