import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get('token')

  if (token && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createAdminClient()
    await supabase
      .from('newsletter_subscribers')
      .delete()
      .eq('unsubscribe_token', token)
  }

  return NextResponse.redirect(new URL('/unsubscribed', origin))
}
