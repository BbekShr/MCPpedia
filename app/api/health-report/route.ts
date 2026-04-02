import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitIp } from '@/lib/rate-limit'
import { z } from 'zod'

const reportSchema = z.object({
  server_id: z.string().uuid(),
  status: z.enum(['pass', 'fail', 'timeout', 'error']),
  response_time_ms: z.number().int().min(0).max(60000).optional(),
  transport: z.string().max(20).optional(),
  source: z.literal('user-test'),
})

export async function POST(request: Request) {
  // Rate limit by IP — 10 reports per hour (prevent spam)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimitIp(ip, 'health-report', 10, 3600_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const body = await request.json()
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const supabase = await createClient()

  // Insert health check record
  const { error } = await supabase.from('health_checks').insert({
    server_id: data.server_id,
    status: data.status,
    response_time_ms: data.response_time_ms || null,
    checked_transport: data.transport || null,
    checked_client: 'user-browser',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update server's last health check status
  // Use majority vote from last 5 user reports
  const { data: recentChecks } = await supabase
    .from('health_checks')
    .select('status')
    .eq('server_id', data.server_id)
    .order('checked_at', { ascending: false })
    .limit(5)

  if (recentChecks && recentChecks.length > 0) {
    const passCount = recentChecks.filter((c: { status: string }) => c.status === 'pass').length
    const majorityStatus = passCount > recentChecks.length / 2 ? 'pass' : 'fail'

    // Calculate uptime from all checks
    const { data: allChecks } = await supabase
      .from('health_checks')
      .select('status')
      .eq('server_id', data.server_id)

    const total = allChecks?.length || 1
    const passes = allChecks?.filter((c: { status: string }) => c.status === 'pass').length || 0
    const uptime = (passes / total) * 100

    await supabase
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
