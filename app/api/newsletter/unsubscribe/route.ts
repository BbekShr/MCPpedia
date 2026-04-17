import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Unsubscribe is POST-only to prevent link prefetchers / email-security scanners
// from silently unsubscribing users. The GET handler renders a confirmation page
// (app/unsubscribed/page.tsx routes to a confirm flow; see /app/unsubscribed).
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createAdminClient('newsletter-unsubscribe')
  const { error } = await supabase
    .from('newsletter_subscribers')
    .delete()
    .eq('unsubscribe_token', token)

  if (error) {
    return NextResponse.json({ error: 'Unsubscribe failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
