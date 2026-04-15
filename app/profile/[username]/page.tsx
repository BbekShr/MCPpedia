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
  return { title: `@${username}` }
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
  const [{ data: recentEdits }, { data: recentDiscussions }] = await Promise.all([
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
      <div className="grid grid-cols-3 gap-4 mb-8">
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
      </div>

      {/* Recent activity */}
      <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Activity</h2>

      <div className="space-y-3">
        {(recentEdits as (Edit & { server: { name: string; slug: string } })[] || []).map(edit => (
          <div key={edit.id} className="flex items-start gap-3 text-sm">
            <span className="text-text-muted shrink-0 w-16">
              {new Date(edit.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-text-primary">
              Proposed edit to{' '}
              <Link href={`/s/${edit.server?.slug}`} className="text-accent hover:text-accent-hover">
                {edit.server?.name}
              </Link>
              {' '}({edit.field_name})
            </span>
          </div>
        ))}
        {(recentDiscussions as (Discussion & { server: { name: string; slug: string } })[] || []).map(d => (
          <div key={d.id} className="flex items-start gap-3 text-sm">
            <span className="text-text-muted shrink-0 w-16">
              {new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-text-primary">
              Posted in{' '}
              <Link href={`/s/${(d as Discussion & { server: { name: string; slug: string } }).server?.slug}`} className="text-accent hover:text-accent-hover">
                {(d as Discussion & { server: { name: string; slug: string } }).server?.name}
              </Link>
            </span>
          </div>
        ))}
        {(!recentEdits?.length && !recentDiscussions?.length) && (
          <p className="text-sm text-text-muted">No activity yet.</p>
        )}
      </div>
    </div>
  )
}
