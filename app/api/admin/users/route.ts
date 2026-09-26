import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin-only account metrics: how many accounts exist, how many signed up
 * recently, and how recently people have signed in.
 *
 * Deliberately NOT on the public /analytics page: /analytics is statically
 * generated for SEO and covers the MCP *ecosystem*. Account counts are
 * operational data about MCPpedia's own users, so they live behind the same
 * `profiles.role IN ('maintainer','admin')` gate as every other admin route.
 *
 * Two different sources, for two different reasons:
 *   - Signups come from `profiles.created_at`. The table is the app's own
 *     mirror of auth.users and one indexed column selection over a 90-day
 *     window is cheap.
 *   - Sign-in recency comes from the GoTrue admin API, because
 *     `auth.users.last_sign_in_at` is not reachable through PostgREST at all
 *     (the `auth` schema is not exposed). There is no per-event sign-in
 *     history anywhere in this database — GoTrue keeps only the LAST sign-in
 *     per user — so we report "active in the last N days", which is the
 *     honest metric that data supports. A true sign-in *trend* would need a
 *     new events table; see the note in the UI.
 */

const DAY_MS = 86_400_000

// Cap the GoTrue pagination so a future large user base cannot turn this
// route into an unbounded fan-out. If the cap is hit we say so rather than
// reporting a silently truncated count as if it were complete.
const AUTH_PAGE_SIZE = 1000
const AUTH_MAX_PAGES = 10

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['maintainer', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const admin = createAdminClient('admin-users-metrics')
  const now = Date.now()

  // Total accounts (head-only exact count — transfers no rows).
  const { count: totalUsers, error: countError } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    return NextResponse.json({ error: `profiles count failed: ${countError.message}` }, { status: 500 })
  }

  // Signups over the last 90 days, bucketed by UTC day.
  const floor = new Date(now - 89 * DAY_MS)
  floor.setUTCHours(0, 0, 0, 0)

  const { data: recentProfiles, error: signupError } = await admin
    .from('profiles')
    .select('created_at')
    .gte('created_at', floor.toISOString())
    .order('created_at', { ascending: true })

  if (signupError) {
    return NextResponse.json({ error: `signups fetch failed: ${signupError.message}` }, { status: 500 })
  }

  // Pre-seed every day in the window at 0 so days with no signups render as a
  // real zero rather than dropping out and compressing the x-axis.
  const signupsByDay: Record<string, number> = {}
  for (let i = 0; i < 90; i++) {
    signupsByDay[new Date(floor.getTime() + i * DAY_MS).toISOString().slice(0, 10)] = 0
  }
  for (const row of recentProfiles || []) {
    const day = new Date(row.created_at as string).toISOString().slice(0, 10)
    if (day in signupsByDay) signupsByDay[day] += 1
  }

  const countSince = (days: number) =>
    (recentProfiles || []).filter(r => new Date(r.created_at as string).getTime() >= now - days * DAY_MS).length

  // Sign-in recency from GoTrue.
  let signedInLast24h = 0
  let signedInLast7d = 0
  let signedInLast30d = 0
  let neverSignedIn = 0
  let authScanned = 0
  let authTruncated = false
  let authError: string | null = null

  for (let page = 1; page <= AUTH_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE })
    if (error) {
      authError = error.message
      break
    }
    const users = data?.users || []
    for (const u of users) {
      authScanned += 1
      if (!u.last_sign_in_at) {
        neverSignedIn += 1
        continue
      }
      const age = now - new Date(u.last_sign_in_at).getTime()
      if (age <= DAY_MS) signedInLast24h += 1
      if (age <= 7 * DAY_MS) signedInLast7d += 1
      if (age <= 30 * DAY_MS) signedInLast30d += 1
    }
    if (users.length < AUTH_PAGE_SIZE) break
    if (page === AUTH_MAX_PAGES) authTruncated = true
  }

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    signups: {
      last7d: countSince(7),
      last30d: countSince(30),
      last90d: (recentProfiles || []).length,
      byDay: Object.entries(signupsByDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count })),
    },
    activity: authError
      ? { error: authError }
      : {
          scanned: authScanned,
          truncated: authTruncated,
          signedInLast24h,
          signedInLast7d,
          signedInLast30d,
          neverSignedIn,
        },
  })
}
