import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUsername } from '@/lib/username'
import { rateLimitUser } from '@/lib/rate-limit'

// GET /api/username?candidate=foo — check availability.
// Intentionally doesn't require auth; anyone can type in a name and see if
// it's free. The candidate is validated first so we never run a DB query
// for obviously invalid input.
export async function GET(request: Request) {
  const candidate = new URL(request.url).searchParams.get('candidate') ?? ''
  const validation = validateUsername(candidate)
  if (!validation.ok) {
    return NextResponse.json({ available: false, reason: validation.reason })
  }

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', validation.normalized)

  if (error) {
    return NextResponse.json({ available: false, reason: 'Could not check availability.' }, { status: 500 })
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json({ available: false, reason: 'That username is taken.' })
  }

  return NextResponse.json({ available: true, normalized: validation.normalized })
}

// POST /api/username — set the signed-in user's username. Used once by
// /welcome during onboarding, and also by /settings to change it later.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimitUser(user.id, 'set-username', 10, 3600_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts, try again later.' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const raw = (body as { username?: unknown })?.username
  const validation = validateUsername(typeof raw === 'string' ? raw : '')
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 })
  }

  // Conflict check before the update to return a friendly error. The unique
  // constraint on profiles.username is the final arbiter — race conditions
  // fall through to the update error handler below.
  const { count: existingCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', validation.normalized)
    .neq('id', user.id)

  if ((existingCount ?? 0) > 0) {
    return NextResponse.json({ error: 'That username is taken.' }, { status: 409 })
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ username: validation.normalized, username_set: true })
    .eq('id', user.id)

  if (updateErr) {
    if (updateErr.code === '23505') {
      return NextResponse.json({ error: 'That username is taken.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to set username.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, username: validation.normalized })
}
