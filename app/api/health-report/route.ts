import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitIp, rateLimitUser, getClientIp } from '@/lib/rate-limit'
import { z } from 'zod'

const reportSchema = z.object({
  server_id: z.string().uuid(),
  status: z.enum(['pass', 'fail', 'timeout', 'error']),
  response_time_ms: z.number().int().min(0).max(60000).optional(),
  transport: z.string().max(20).optional(),
  source: z.literal('user-test'),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  // Rate limit by user + IP
  const rlIp = await rateLimitIp(getClientIp(request), 'health-report', 10, 3600_000)
  const rlUser = await rateLimitUser(user.id, 'health-report', 10, 3600_000)
  if (!rlIp.allowed || !rlUser.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Use admin client for data operations — health_checks has no user INSERT policy
  const admin = createAdminClient('health-report')

  const { error } = await admin.from('health_checks').insert({
    server_id: data.server_id,
    user_id: user.id,
    status: data.status,
    response_time_ms: data.response_time_ms || null,
    checked_transport: data.transport || null,
    checked_client: 'user-browser',
  })

  if (error) {
    console.error('health-report insert error:', error.message)
    return NextResponse.json({ error: 'Failed to record health report' }, { status: 500 })
  }

  // Recompute the server's health status from ONE vote per distinct user (their
  // latest report), not raw rows — otherwise a single account filing 5 `fail`
  // reports flips a healthy server. Legacy rows with no user_id count individually.
  const { data: recentRows } = await admin
    .from('health_checks')
    .select('id, user_id, status')
    .eq('server_id', data.server_id)
    .order('checked_at', { ascending: false })
    .limit(200)

  if (recentRows && recentRows.length > 0) {
    const latestPerUser = new Map<string, string>()
    for (const row of recentRows as Array<{ id: string; user_id: string | null; status: string }>) {
      const key = row.user_id ?? `anon:${row.id}`
      if (!latestPerUser.has(key)) latestPerUser.set(key, row.status) // first seen = latest (desc order)
    }
    const votes = [...latestPerUser.values()]

    // Majority over the 5 most-recent distinct voters
    const recentVotes = votes.slice(0, 5)
    const passCount = recentVotes.filter(s => s === 'pass').length
    const majorityStatus = passCount > recentVotes.length / 2 ? 'pass' : 'fail'

    // Uptime = share of distinct voters whose latest report passed
    const total = votes.length
    const passes = votes.filter(s => s === 'pass').length
    const uptime = (passes / total) * 100

    await admin
      .from('servers')
      .update({
        last_health_check_status: majorityStatus,
        last_health_check_at: new Date().toISOString(),
        health_check_uptime: Math.round(uptime * 100) / 100,
      })
      .eq('id', data.server_id)
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
