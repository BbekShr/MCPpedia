import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const signature = request.headers.get('x-hub-signature-256')
  const event = request.headers.get('x-github-event')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  // TODO: Verify signature against GITHUB_WEBHOOK_SECRET
  // TODO: Handle push events to refresh server metadata

  console.log(`GitHub webhook received: ${event}`)

  return NextResponse.json({ ok: true })
}
