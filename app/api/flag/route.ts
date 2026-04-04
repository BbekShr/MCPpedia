import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { flagSchema } from '@/lib/validators'
import { rateLimitUser } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimitUser(user.id, 'flag', 10, 3600_000) // 10 per hour
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = flagSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  const { error } = await supabase
    .from('flags')
    .insert({
      user_id: user.id,
      target_type: data.target_type,
      target_id: data.target_id,
      reason: data.reason,
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You have already flagged this' }, { status: 409 })
    }
    console.error('flag insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit flag' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
