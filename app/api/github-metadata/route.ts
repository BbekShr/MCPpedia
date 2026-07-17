import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchRepoMetadataResult } from '@/lib/github'

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

  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com')) {
    return NextResponse.json({ error: 'Must be a https://github.com URL' }, { status: 400 })
  }

  // Ensure path matches owner/repo pattern to prevent path traversal
  if (!/^\/[\w.-]+\/[\w.-]+\/?$/.test(parsed.pathname)) {
    return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
  }

  const result = await fetchRepoMetadataResult(url)

  if (!result.ok) {
    switch (result.error) {
      case 'rate_limited':
        return NextResponse.json(
          { error: 'GitHub is rate-limiting our requests right now. You can fill in the details manually below, or try Auto-fill again in a few minutes.' },
          { status: 503 }
        )
      case 'not_found':
        return NextResponse.json(
          { error: 'Repository not found on GitHub. Check the URL — private repositories cannot be auto-filled.' },
          { status: 404 }
        )
      default:
        return NextResponse.json(
          { error: 'Could not reach GitHub to fetch repository metadata. You can fill in the details manually below.' },
          { status: 502 }
        )
    }
  }

  return NextResponse.json(result.metadata)
}
