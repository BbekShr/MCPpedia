import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

// On-demand ISR revalidation for bot-driven data updates.
//
// Background: pages like /security and / use `export const revalidate = <N>`
// which produces a stale-while-revalidate cache. Without a trigger, the cache
// only refreshes on user traffic after the TTL — if the daily security-scan
// bot writes new data but nobody visits /security for an hour, the page stays
// frozen on the prior snapshot. This endpoint lets the bot explicitly mark
// those paths stale the moment it finishes writing.
//
// Default path set is intentionally small and security-focused since that's
// the only caller today; extend by passing `paths` in the body if another bot
// needs it.

const DEFAULT_PATHS = ['/', '/security'] as const

const schema = z.object({
  paths: z.array(z.string().startsWith('/').max(1024)).max(200).optional(),
})

function authorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (presented.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(presented), Buffer.from(secret))
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown = {}
  try {
    const text = await request.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const paths = parsed.data.paths ?? [...DEFAULT_PATHS]
  for (const p of paths) revalidatePath(p)

  return NextResponse.json({ revalidated: paths, at: Date.now() })
}
