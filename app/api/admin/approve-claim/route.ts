import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { rateLimitUser } from '@/lib/rate-limit'
import { revalidateServer } from '@/lib/revalidate'

const approveSchema = z.object({
  claim_id: z.string().uuid(),
  reject: z.boolean().optional(),
})

// Maintainer/admin decision on a publisher claim. Approving marks the claim
// verified and flips the server's publisher_verified flag + claimed_by owner.
// publisher_claims has no update RLS policy for regular users, so both writes
// go through the admin client.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const rl = await rateLimitUser(user.id, 'approve-claim', 100, 3600_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { claim_id, reject } = parsed.data

  const { data: claim, error: fetchErr } = await supabase
    .from('publisher_claims')
    .select('id, server_id, user_id, verified')
    .eq('id', claim_id)
    .single()

  if (fetchErr || !claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }
  if (claim.verified) {
    return NextResponse.json({ error: 'Claim already verified' }, { status: 409 })
  }

  const admin = createAdminClient(`claim-${reject ? 'rejected' : 'approved'}-by:${user.id}`, claim.user_id)

  if (reject) {
    // A rejected claim is removed so the claimant can try again with better proof.
    const { error: delErr } = await admin.from('publisher_claims').delete().eq('id', claim_id)
    if (delErr) {
      console.error('claim reject error:', delErr.message)
      return NextResponse.json({ error: 'Failed to reject claim' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, action: 'rejected' })
  }

  // Approve: mark the claim verified, then flip the server's publisher flags.
  const { error: claimErr } = await admin
    .from('publisher_claims')
    .update({ verified: true, verified_by: user.id, verified_at: new Date().toISOString() })
    .eq('id', claim_id)

  if (claimErr) {
    console.error('claim verify error:', claimErr.message)
    return NextResponse.json({ error: 'Failed to verify claim' }, { status: 500 })
  }

  const { error: srvErr } = await admin
    .from('servers')
    .update({ publisher_verified: true, claimed_by: claim.user_id })
    .eq('id', claim.server_id)

  if (srvErr) {
    // Roll the claim back to unverified so the flags stay consistent.
    console.error('claim apply error; reverting claim:', srvErr.message)
    await admin
      .from('publisher_claims')
      .update({ verified: false, verified_by: null, verified_at: null })
      .eq('id', claim_id)
    return NextResponse.json({ error: 'Failed to apply claim' }, { status: 500 })
  }

  const { data: srv } = await supabase
    .from('servers')
    .select('slug')
    .eq('id', claim.server_id)
    .single()
  if (srv?.slug) revalidateServer(srv.slug)

  return NextResponse.json({ ok: true, action: 'approved' })
}
