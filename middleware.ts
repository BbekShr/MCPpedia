import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/api/community-verify',
    '/api/discuss',
    '/api/vote',
    '/api/favorites',
    '/api/submit',
    '/api/edit',
    '/api/flag',
    '/api/github-metadata',
    '/api/admin/:path*',
    '/api/server/:path*/categories',
    '/api/server/:path*/refresh-score',
    '/api/health-report',
    '/auth/:path*',
  ],
}
