import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import { rateLimitIp, getClientIp } from '@/lib/rate-limit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const rl = await rateLimitIp(getClientIp(request), 'server-detail', 120, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const { slug } = await params
  const supabase = await createClient()

  const { data: server, error } = await supabase
    .from('servers')
    .select(PUBLIC_SERVER_FIELDS)
    .eq('slug', slug)
    .single()

  if (error || !server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }

  return NextResponse.json(server)
}
