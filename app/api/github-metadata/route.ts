import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchRepoMetadata } from '@/lib/github'

export async function GET(request: Request) {
  // Require authentication to prevent abuse as a GitHub API proxy
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Strict URL validation — must be a real GitHub URL
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
    return NextResponse.json({ error: 'Must be a github.com URL' }, { status: 400 })
  }

  const metadata = await fetchRepoMetadata(url)

  if (!metadata) {
    return NextResponse.json({ error: 'Could not fetch repository' }, { status: 404 })
  }

  return NextResponse.json(metadata)
}
