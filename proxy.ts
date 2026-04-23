import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

// Run on every page and auth-sensitive route so Supabase can refresh the
// session cookie on each request. Narrowing this to specific API paths
// broke auth: @supabase/ssr stores tokens in HttpOnly cookies, and the
// browser client cannot refresh them on its own — the server-side proxy
// has to call getUser() and write rotated cookies back.
//
// Excludes static assets, image optimizer output, favicon, sitemap
// variants, robots.txt, and xml/image files to keep CDN caching intact.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xml)$).*)',
  ],
}
