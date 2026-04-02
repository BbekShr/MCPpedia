import { NextResponse } from 'next/server'
import { fetchRepoMetadata } from '@/lib/github'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  if (!url.includes('github.com/')) {
    return NextResponse.json({ error: 'Must be a valid GitHub URL' }, { status: 400 })
  }

  const metadata = await fetchRepoMetadata(url)

  if (!metadata) {
    return NextResponse.json({ error: 'Could not fetch repository' }, { status: 404 })
  }

  return NextResponse.json(metadata)
}
