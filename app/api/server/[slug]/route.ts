import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
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
