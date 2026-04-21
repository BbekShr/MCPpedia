import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import type { Profile, Edit, Discussion } from '@/lib/types'
import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 3600

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

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = createPublicClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, github_username, bio, servers_submitted, edits_approved, discussions_count, role, created_at')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const p = profile as Profile

  // Fetch recent activity
  const [
    { data: recentEdits },
    { data: recentDiscussions },
    { data: recentVerifications, count: verificationCount },
  ] = await Promise.all([
    supabase
      .from('edits')
      .select('*, server:servers(name, slug)')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('discussions')
      .select('*, server:servers(name, slug)')
      .eq('user_id', p.id)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('community_verifications')
      .select('created_at, server:servers(name, slug)', { count: 'exact' })
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const roleColors: Record<string, string> = {
    admin: 'bg-red/10 text-red',
    maintainer: 'bg-accent/10 text-accent',
    editor: 'bg-green/10 text-green',
    contributor: 'bg-bg-tertiary text-text-muted',
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Profile header */}
      <div className="flex items-start gap-4 mb-8">
        {p.avatar_url && (
          <img
            src={p.avatar_url}
            alt={p.username}
            className="w-16 h-16 rounded-full"
          />
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-text-primary">@{p.username}</h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${roleColors[p.role] || ''}`}>
              {p.role}
            </span>
          </div>
          {p.display_name && (
            <p className="text-text-muted">{p.display_name}</p>
          )}
          {p.bio && <p className="text-sm text-text-muted mt-1">{p.bio}</p>}
          <p className="text-xs text-text-muted mt-2">
            Joined {new Date(p.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-border rounded-md p-4 text-center">
          <div className="text-2xl font-semibold text-text-primary">{p.servers_submitted}</div>
          <div className="text-xs text-text-muted">Servers submitted</div>
        </div>
        <div className="border border-border rounded-md p-4 text-center">
          <div className="text-2xl font-semibold text-text-primary">{p.edits_approved}</div>
          <div className="text-xs text-text-muted">Edits approved</div>
        </div>
        <div className="border border-border rounded-md p-4 text-center">
          <div className="text-2xl font-semibold text-text-primary">{p.discussions_count}</div>
          <div className="text-xs text-text-muted">Discussions</div>
        </div>
        <div className="border border-border rounded-md p-4 text-center">
          <div className="text-2xl font-semibold text-text-primary">{verificationCount ?? 0}</div>
          <div className="text-xs text-text-muted">Servers verified</div>
        </div>
      </div>

      {/* Recent activity */}
      <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Activity</h2>

      <ActivityFeed
        edits={(recentEdits as (Edit & { server: { name: string; slug: string } })[]) ?? []}
        discussions={(recentDiscussions as (Discussion & { server: { name: string; slug: string } })[]) ?? []}
        verifications={(recentVerifications as { created_at: string; server: { name: string; slug: string } | null }[]) ?? []}
      />
    </div>
  )
}

type FeedServer = { name: string; slug: string } | null

function ActivityFeed({
  edits,
  discussions,
  verifications,
}: {
  edits: (Edit & { server: FeedServer })[]
  discussions: (Discussion & { server: FeedServer })[]
  verifications: { created_at: string; server: FeedServer }[]
}) {
  type Item =
    | { kind: 'edit'; at: string; key: string; server: FeedServer; field: string }
    | { kind: 'discussion'; at: string; key: string; server: FeedServer }
    | { kind: 'verification'; at: string; key: string; server: FeedServer }

  const items: Item[] = [
    ...edits.map<Item>(e => ({ kind: 'edit', at: e.created_at, key: `e:${e.id}`, server: e.server, field: e.field_name })),
    ...discussions.map<Item>(d => ({ kind: 'discussion', at: d.created_at, key: `d:${d.id}`, server: d.server })),
    ...verifications.map<Item>(v => ({ kind: 'verification', at: v.created_at, key: `v:${v.server?.slug ?? ''}:${v.created_at}`, server: v.server })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet.</p>
  }

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.key} className="flex items-start gap-3 text-sm">
          <span className="text-text-muted shrink-0 w-16">
            {new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-text-primary">
            {item.kind === 'edit' && (
              <>
                Proposed edit to{' '}
                <Link href={`/s/${item.server?.slug}`} className="text-accent hover:text-accent-hover">
                  {item.server?.name}
                </Link>
                {' '}({item.field})
              </>
            )}
            {item.kind === 'discussion' && (
              <>
                Posted in{' '}
                <Link href={`/s/${item.server?.slug}`} className="text-accent hover:text-accent-hover">
                  {item.server?.name}
                </Link>
              </>
            )}
            {item.kind === 'verification' && (
              <>
                Verified{' '}
                <Link href={`/s/${item.server?.slug}`} className="text-accent hover:text-accent-hover">
                  {item.server?.name}
                </Link>
                {' '}works for them
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
