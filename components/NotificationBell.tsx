'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface NotificationRow {
  id: number
  type: 'edit_approved' | 'edit_rejected'
  field_name: string | null
  read_at: string | null
  created_at: string
  server: { name: string; slug: string } | null
}

const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  tagline: 'tagline',
  description: 'description',
  api_name: 'API name',
  api_pricing: 'API pricing',
  api_rate_limits: 'API rate limits',
  homepage_url: 'homepage',
  npm_package: 'npm package',
  pip_package: 'pip package',
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Poll unread count every minute.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .then(({ count }) => {
          if (!cancelled) setUnread(count || 0)
        })
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [supabase, userId])

  // When the dropdown opens, fetch the recent items and mark unread as read.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    supabase
      .from('notifications')
      .select('id, type, field_name, read_at, created_at, server:servers(name, slug)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setItems((data || []) as unknown as NotificationRow[])
      })

    const now = new Date().toISOString()
    supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null)
      .then(() => {
        if (!cancelled) {
          setUnread(0)
          setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })))
        }
      })

    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      cancelled = true
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, supabase, userId])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-accent-fg text-[10px] font-semibold leading-[16px] text-center tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-bg border border-border rounded-md shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-sm font-medium text-text-primary">Notifications</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-sm text-text-muted text-center">No notifications yet.</p>
            ) : (
              items.map(n => {
                const fieldLabel = n.field_name ? (FIELD_LABELS[n.field_name] || n.field_name) : 'edit'
                const action = n.type === 'edit_approved' ? 'approved' : 'rejected'
                const tone = n.type === 'edit_approved' ? 'text-green' : 'text-red'
                const href = n.server?.slug ? `/s/${n.server.slug}/history` : '#'
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 border-b border-border last:border-b-0 hover:bg-bg-tertiary"
                  >
                    <div className="text-sm text-text-primary">
                      Your <span className="font-medium">{fieldLabel}</span> edit on{' '}
                      <span className="font-medium">{n.server?.name || 'a server'}</span> was{' '}
                      <span className={`font-medium ${tone}`}>{action}</span>.
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{formatRelative(n.created_at)}</div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
