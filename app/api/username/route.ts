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

  // `.select('id')` is load-bearing, not cosmetic. Postgres raises 42501 only on
  // an RLS WITH CHECK violation; a row excluded by a policy's USING clause is
  // simply not updated — no error at all. Without a select the client sends
  // `Prefer: return=minimal` and PostgREST answers 204 with `error === null`, so
  // an RLS-filtered write returned 200 {ok:true} having written nothing:
  // /welcome showed the celebration and /auth/callback bounced the user back
  // there on every later sign-in because username_set was still false.
  //
  // Zero rows has two possible causes and the route cannot tell them apart:
  // either a policy's USING clause excludes the row — which is what happens for
  // every non-admin while `profiles` carries no self-update policy, the state
  // production is in until the restoring migration in PR #156 lands (BACKLOG
  // S98/S99) — or the `profiles` row is absent because the `handle_new_user`
  // trigger (20260402000000_initial_schema.sql:268-270) never fired for this
  // user. Neither clears on a retry, and this route is rate-limited 10/hour
  // above, so the message must not send the user back around that loop into
  // a 429.
  const { data: updated, error: updateErr } = await supabase
    .from('profiles')
    .update({ username: validation.normalized, username_set: true })
    .eq('id', user.id)
    .select('id')

  if (updateErr) {
    if (updateErr.code === '23505') {
      return NextResponse.json({ error: 'That username is taken.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to set username.' }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'Your profile could not be updated. Try signing out and back in — if that does not help, contact support.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, username: validation.normalized })
}
