import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitIp, getClientIp } from '@/lib/rate-limit'

const schema = z.object({
  email: z.email(),
})

export async function POST(request: Request) {
  const rl = await rateLimitIp(getClientIp(request), 'newsletter-subscribe', 3, 3600_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const { email } = parsed.data

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient('newsletter-subscribe')
  // Upsert — ignore if already subscribed (don't leak whether email exists)
  await supabase
    .from('newsletter_subscribers')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })

  return NextResponse.json({ ok: true })
}
