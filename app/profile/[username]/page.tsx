import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import type { Profile } from '@/lib/types'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getKarmaProgress } from '@/lib/karma'

export const revalidate = 86400 // 24h; on-demand revalidate triggers on karma writes

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  return {
    title: `@${username}`,
    description: `Contributions by @${username} on MCPpedia.`,
    robots: { index: false, follow: true },
  }
}

interface KarmaEventRow {
  id: number
  action: string
  points: number
  created_at: string
  server: { name: string; slug: string } | null
}

const ACTION_COPY: Record<string, { verb: string; icon: string; color: string }> = {
  submit_server:          { verb: 'Submitted',            icon: '🚀', color: 'text-accent' },
  edit_proposed:          { verb: 'Proposed an edit to',  icon: '✎',  color: 'text-text-muted' },
  edit_approved:          { verb: 'Edit approved on',     icon: '✓',  color: 'text-green' },
  edit_rejected_refund:   { verb: 'Edit rejected on',     icon: '✗',  color: 'text-red' },
  edit_unapproved_refund: { verb: 'Edit reverted on',     icon: '↺',  color: 'text-red' },
  submit_server_refund:   { verb: 'Server removed:',      icon: '—',  color: 'text-red' },
  discussion_post:        { verb: 'Posted in',            icon: '💬', color: 'text-text-primary' },
  verification:           { verb: 'Verified',             icon: '👍', color: 'text-green' },
  verification_refund:    { verb: 'Un-verified',          icon: '↺',  color: 'text-text-muted' },
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = createPublicClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, github_username, bio, servers_submitted, edits_approved, discussions_count, karma, created_at')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const p = profile as Omit<Profile, 'role'> & { karma?: number | null }
  const karma = p.karma ?? 0
  const progress = getKarmaProgress(karma)

  const [{ data: events }, { count: verificationCount }] = await Promise.all([
    supabase
      .from('karma_events')
      .select('id, action, points, created_at, server:servers(name, slug)')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('community_verifications')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', p.id),
  ])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header card */}
      <div className="border border-border rounded-xl p-6 bg-bg-secondary/30 mb-6">
        <div className="flex items-start gap-4">
          {p.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.avatar_url}
              alt={p.username}
              className="w-20 h-20 rounded-full ring-2 ring-border"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-text-primary">@{p.username}</h1>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${progress.tier.badgeClass}`}>
                {progress.tier.name}
              </span>
            </div>
            {p.display_name && <p className="text-text-muted mt-0.5">{p.display_name}</p>}
            {p.bio && <p className="text-sm text-text-muted mt-1.5">{p.bio}</p>}
            <p className="text-xs text-text-muted mt-2">
              Joined {new Date(p.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Karma hero */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-text-primary tabular-nums">{karma}</span>
                <span className="text-sm text-text-muted">karma</span>
              </div>
              <p className="text-xs text-text-muted mt-1">{progress.tier.blurb}</p>
            </div>
            {progress.next && (
              <div className="text-right">
                <p className="text-xs text-text-muted">
                  {progress.toNext} to <span className="font-medium text-text-primary">{progress.next.name}</span>
                </p>
              </div>
            )}
          </div>
          {progress.next && (
            <div className="mt-3 h-2 w-full bg-border rounded-full overflow-hidden">
              <div
                className={`h-full ${progress.tier.barClass} transition-all duration-500`}
                style={{ width: `${Math.max(4, progress.pct * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard value={p.servers_submitted} label="Servers submitted" />
        <StatCard value={p.edits_approved} label="Edits approved" />
        <StatCard value={p.discussions_count} label="Discussions" />
        <StatCard value={verificationCount ?? 0} label="Servers verified" />
      </div>

      {/* How karma works */}
      <details className="mb-6 text-sm">
        <summary className="cursor-pointer text-text-muted hover:text-text-primary inline-block">
          How karma works
        </summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs text-text-muted">
          <div>Submit a community server: <span className="text-text-primary font-medium">+15</span></div>
          <div>Get an edit approved: <span className="text-text-primary font-medium">+5</span></div>
          <div>Propose an edit: <span className="text-text-primary font-medium">+1</span></div>
          <div>Post in a discussion: <span className="text-text-primary font-medium">+2</span></div>
          <div>Verify a server works for you: <span className="text-text-primary font-medium">+1</span></div>
        </div>
      </details>

      {/* Recent activity */}
      <h2 className="text-lg font-semibold text-text-primary mb-3">Recent Activity</h2>
      <ActivityFeed events={(events as KarmaEventRow[] | null) ?? []} />
    </div>
  )
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="border border-border rounded-lg p-4 text-center bg-bg">
      <div className="text-2xl font-semibold text-text-primary tabular-nums">{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  )
}

function ActivityFeed({ events }: { events: KarmaEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet. Submit a server, propose an edit, or verify something you&apos;ve used to start earning karma.</p>
  }

  return (
    <ol className="space-y-2">
      {events.map(ev => {
        const copy = ACTION_COPY[ev.action] ?? { verb: ev.action, icon: '•', color: 'text-text-muted' }
        const isGain = ev.points > 0
        return (
          <li
            key={ev.id}
            className="flex items-center gap-3 text-sm border border-border rounded-md px-3 py-2 bg-bg hover:bg-bg-secondary/50 transition-colors"
          >
            <span className={`shrink-0 text-base ${copy.color}`} aria-hidden="true">{copy.icon}</span>
            <span className="flex-1 min-w-0 truncate text-text-primary">
              {copy.verb}
              {ev.server && (
                <>
                  {' '}
                  <Link href={`/s/${ev.server.slug}`} className="text-accent hover:text-accent-hover">
                    {ev.server.name}
                  </Link>
                </>
              )}
            </span>
            <span className="text-xs text-text-muted shrink-0 hidden sm:inline">
              {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span
              className={`shrink-0 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                isGain ? 'bg-green/10 text-green' : 'bg-red/10 text-red'
              }`}
            >
              {isGain ? '+' : ''}{ev.points}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
