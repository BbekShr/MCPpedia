'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Discussion, Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

interface DiscussionWithProfile extends Discussion {
  profile: Profile
  replies: DiscussionWithProfile[]
}

export default function DiscussionSection({ serverId }: { serverId: string }) {
  const [discussions, setDiscussions] = useState<DiscussionWithProfile[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  const fetchDiscussions = useCallback(async () => {
    const { data } = await supabase
      .from('discussions')
      .select('*, profile:profiles(*)')
      .eq('server_id', serverId)
      .is('parent_id', null)
      .order('upvotes', { ascending: false })
      .order('created_at', { ascending: false })

    if (data) {
      // Fetch replies for each top-level discussion
      const withReplies = await Promise.all(
        (data as DiscussionWithProfile[]).map(async (d) => {
          const { data: replies } = await supabase
            .from('discussions')
            .select('*, profile:profiles(*)')
            .eq('parent_id', d.id)
            .order('created_at', { ascending: true })
          return { ...d, replies: (replies || []) as DiscussionWithProfile[] }
        })
      )
      setDiscussions(withReplies)
    }
  }, [serverId, supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchDiscussions()

    // Realtime subscription
    const channel = supabase
      .channel(`discussions:${serverId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'discussions',
        filter: `server_id=eq.${serverId}`,
      }, () => {
        fetchDiscussions()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [serverId, supabase, fetchDiscussions])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || !user) return
    setSubmitting(true)

    const res = await fetch('/api/discuss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, body: body.trim() }),
    })

    if (res.ok) {
      setBody('')
      fetchDiscussions()
    }
    setSubmitting(false)
  }

  async function handleReply(parentId: string) {
    if (!replyBody.trim() || !user) return
    setSubmitting(true)

    const res = await fetch('/api/discuss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, parent_id: parentId, body: replyBody.trim() }),
    })

    if (res.ok) {
      setReplyBody('')
      setReplyTo(null)
      fetchDiscussions()
    }
    setSubmitting(false)
  }

  async function handleVote(discussionId: string, value: 1 | -1) {
    if (!user) return
    await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discussion_id: discussionId, value }),
    })
    fetchDiscussions()
  }

  function timeAgo(date: string): string {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div>
      {/* Discussion list */}
      {discussions.length > 0 ? (
        <div className="space-y-4 mb-6">
          {discussions.map(d => (
            <div key={d.id} className="border border-border rounded-md p-4">
              <div className="flex items-start gap-3">
                {/* Vote controls */}
                <div className="flex flex-col items-center gap-0.5 text-text-muted">
                  <button onClick={() => handleVote(d.id, 1)} className="hover:text-accent p-0.5" disabled={!user}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
                  </button>
                  <span className="text-xs font-medium">{d.upvotes}</span>
                  <button onClick={() => handleVote(d.id, -1)} className="hover:text-red p-0.5" disabled={!user}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                    <span className="font-medium text-text-primary">
                      @{d.profile?.username || 'anonymous'}
                    </span>
                    <span>{timeAgo(d.created_at)}</span>
                  </div>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{d.body}</p>

                  <button
                    onClick={() => setReplyTo(replyTo === d.id ? null : d.id)}
                    className="mt-2 text-xs text-text-muted hover:text-accent"
                  >
                    {d.replies?.length ? `${d.replies.length} replies` : 'Reply'}
                  </button>

                  {/* Replies */}
                  {d.replies && d.replies.length > 0 && (
                    <div className="mt-3 space-y-3 pl-4 border-l-2 border-border">
                      {d.replies.map(reply => (
                        <div key={reply.id}>
                          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                            <span className="font-medium text-text-primary">
                              @{reply.profile?.username || 'anonymous'}
                            </span>
                            <span>{timeAgo(reply.created_at)}</span>
                          </div>
                          <p className="text-sm text-text-primary whitespace-pre-wrap">{reply.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply form */}
                  {replyTo === d.id && user && (
                    <div className="mt-3 pl-4 border-l-2 border-border">
                      <textarea
                        value={replyBody}
                        onChange={e => setReplyBody(e.target.value)}
                        placeholder="Write a reply..."
                        rows={2}
                        className="w-full border border-border rounded-md p-2 text-sm bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                      />
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleReply(d.id)}
                          disabled={submitting || !replyBody.trim()}
                          className="px-3 py-1 text-xs rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          Reply
                        </button>
                        <button
                          onClick={() => { setReplyTo(null); setReplyBody('') }}
                          className="px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted mb-6">No discussions yet. Be the first to share your experience!</p>
      )}

      {/* New discussion form */}
      {user ? (
        <form onSubmit={handleSubmit}>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Start a discussion..."
            rows={3}
            className="w-full border border-border rounded-md p-3 text-sm bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors duration-150"
            >
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-text-muted">
          <a href="/login" className="text-accent hover:text-accent-hover">Sign in</a> to join the discussion.
        </p>
      )}
    </div>
  )
}
