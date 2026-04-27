import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

// The proxy's only job is to refresh the Supabase session cookie via
// updateSession() — so it only needs to run when a session cookie exists.
// Anonymous traffic (bots, unauth'd readers) has nothing to refresh; gating
// on cookie presence skips the function invocation entirely for those
// requests, which is what reduces Vercel function-invocation cost.
//
// Narrowing by path was tried before and broke auth: @supabase/ssr stores
// tokens in HttpOnly cookies that only the server proxy can rotate, so any
// authed page request must still hit the proxy. Cookie-presence gating is
// safe because the cookie travels on every authed request regardless of
// path.
//
// Two entries because @supabase/ssr chunks long JWTs into `*-auth-token.0`,
// `.1`, … — short JWTs use the bare name. Matchers OR together. The
// project ref `ajbazcumocvpdphbaohm` is the same one in
// NEXT_PUBLIC_SUPABASE_URL (already public).
//
// Source regex excludes static assets, image optimizer output, favicon,
// sitemap variants, robots.txt, and xml/image files to keep CDN caching
// intact.
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|sitemap|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xml)$).*)',
      has: [{ type: 'cookie', key: 'sb-ajbazcumocvpdphbaohm-auth-token' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|sitemap|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xml)$).*)',
      has: [{ type: 'cookie', key: 'sb-ajbazcumocvpdphbaohm-auth-token.0' }],
    },
  ],
}
