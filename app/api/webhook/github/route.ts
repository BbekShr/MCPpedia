import { NextResponse } from 'next/server'

// Webhook endpoint disabled until signature verification is implemented.
// Accepting unverified webhooks would allow anyone to trigger server actions.
export async function POST() {
  return NextResponse.json(
    { error: 'Webhook endpoint is disabled. Signature verification not yet implemented.' },
    { status: 503 }
  )
}
