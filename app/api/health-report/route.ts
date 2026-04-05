import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitIp, rateLimitUser } from '@/lib/rate-limit'
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
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rlIp = rateLimitIp(ip, 'health-report', 10, 3600_000)
  const rlUser = rateLimitUser(user.id, 'health-report', 10, 3600_000)
  if (!rlIp.allowed || !rlUser.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Use admin client for data operations — health_checks has no user INSERT policy
  const admin = createAdminClient()

  const { error } = await admin.from('health_checks').insert({
    server_id: data.server_id,
    status: data.status,
    response_time_ms: data.response_time_ms || null,
    checked_transport: data.transport || null,
    checked_client: 'user-browser',
  })

  if (error) {
    console.error('health-report insert error:', error.message)
    return NextResponse.json({ error: 'Failed to record health report' }, { status: 500 })
  }

  // Update server's last health check status
  // Use majority vote from last 5 user reports
  const { data: recentChecks } = await admin
    .from('health_checks')
    .select('status')
    .eq('server_id', data.server_id)
    .order('checked_at', { ascending: false })
    .limit(5)

  if (recentChecks && recentChecks.length > 0) {
    const passCount = recentChecks.filter((c: { status: string }) => c.status === 'pass').length
    const majorityStatus = passCount > recentChecks.length / 2 ? 'pass' : 'fail'

    // Calculate uptime from all checks
    const { data: allChecks } = await admin
      .from('health_checks')
      .select('status')
      .eq('server_id', data.server_id)
      .order('checked_at', { ascending: false })
      .limit(100)

    const total = allChecks?.length || 1
    const passes = allChecks?.filter((c: { status: string }) => c.status === 'pass').length || 0
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
