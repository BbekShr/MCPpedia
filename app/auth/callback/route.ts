import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Prevent open redirect — only allow relative paths starting with /
  const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // Route brand-new users (or anyone who never picked a handle) through
      // /welcome before dropping them at their original destination.
      const { data: profile } = await supabase
        .from('profiles')
        .select('username_set')
        .eq('id', data.user.id)
        .single()

      if (profile && profile.username_set === false) {
        return NextResponse.redirect(
          `${origin}/welcome?next=${encodeURIComponent(safePath)}`
        )
      }
      return NextResponse.redirect(`${origin}${safePath}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
