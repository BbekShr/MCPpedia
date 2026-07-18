import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'

// Proof types must match the check constraint on publisher_claims.proof_type
// (supabase/migrations/20260402020000_trust_features.sql).
const claimSchema = z.object({
  server_id: z.string().uuid(),
  proof_type: z.enum(['github_org', 'github_repo', 'npm_package', 'dns_txt']),
  proof_value: z.string().trim().min(1).max(300),
})

// POST — an authed user claims ownership of a server. The claim lands unverified;
// a maintainer confirms the proof and flips servers.publisher_verified via
// /api/admin/approve-claim. Verification is manual for now (see BACKLOG for the
// automated GitHub-proof follow-up).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimitUser(user.id, 'claim', 10, 3600_000) // 10 per hour
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = claimSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { server_id, proof_type, proof_value } = parsed.data

  // Verify the server exists (and short-circuit if it's already claimed).
  const { data: server } = await supabase
    .from('servers')
    .select('id, publisher_verified')
    .eq('id', server_id)
    .single()

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }
  if (server.publisher_verified) {
    return NextResponse.json({ error: 'This server has already been claimed.' }, { status: 409 })
  }

  const { data: claim, error } = await supabase
    .from('publisher_claims')
    .insert({ server_id, user_id: user.id, proof_type, proof_value })
    .select('id, verified')
    .single()

  if (error) {
    // unique(server_id, user_id) — the user already submitted a claim.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You have already submitted a claim for this server.' }, { status: 409 })
    }
    console.error('claim insert error:', error.message)
    return NextResponse.json({ error: 'Failed to submit claim' }, { status: 500 })
  }

  return NextResponse.json({ claim }, { status: 201 })
}

// GET — the current user's claim status for a server, to drive the button state.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { searchParams } = new URL(request.url)
  const serverId = searchParams.get('server_id')
  if (!serverId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId)) {
    return NextResponse.json({ error: 'Missing or invalid server_id' }, { status: 400 })
  }

  if (!user) {
    return NextResponse.json({ claim: null })
  }

  const { data } = await supabase
    .from('publisher_claims')
    .select('id, proof_type, verified')
    .eq('user_id', user.id)
    .eq('server_id', serverId)
    .maybeSingle()

  return NextResponse.json({ claim: data ?? null })
}
