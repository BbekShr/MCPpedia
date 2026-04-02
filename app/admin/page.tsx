'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface ServerRow {
  id: string
  slug: string
  name: string
  score_total: number
  health_status: string
  is_archived: boolean
  verified: boolean
  author_type: string
  source: string
  created_at: string
}

interface ProfileRow {
  id: string
  username: string
  role: string
  servers_submitted: number
  edits_approved: number
  discussions_count: number
  created_at: string
}

interface EditRow {
  id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  edit_reason: string
  status: string
  created_at: string
  profile: { username: string } | null
  server: { name: string; slug: string } | null
}

type Tab = 'servers' | 'users' | 'edits'

export default function AdminPage() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('servers')

  const [servers, setServers] = useState<ServerRow[]>([])
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [edits, setEdits] = useState<EditRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    if (tab === 'servers') {
      const { data } = await supabase.from('servers').select('id, slug, name, score_total, health_status, is_archived, verified, author_type, source, created_at').order('created_at', { ascending: false }).limit(50)
      setServers((data || []) as ServerRow[])
    } else if (tab === 'users') {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(50)
      setUsers((data || []) as ProfileRow[])
    } else if (tab === 'edits') {
      const { data } = await supabase.from('edits').select('*, profile:profiles(username), server:servers(name, slug)').order('created_at', { ascending: false }).limit(50)
      setEdits((data || []) as EditRow[])
    }
    setLoading(false)
  }, [tab, supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single().then(({ data: p }) => {
          setRole(p?.role || null)
        })
      }
    })
  }, [supabase])

  useEffect(() => {
    if (role === 'admin' || role === 'maintainer') fetchData()
  }, [role, tab, fetchData])

  async function toggleVerified(serverId: string, current: boolean) {
    await supabase.from('servers').update({ verified: !current }).eq('id', serverId)
    fetchData()
  }

  async function toggleArchived(serverId: string, current: boolean) {
    await fetch('/api/admin/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, archive: !current, reason: 'Admin action' }),
    })
    fetchData()
  }

  async function changeRole(userId: string, newRole: string) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    fetchData()
  }

  async function approveEdit(editId: string, serverId: string, fieldName: string, newValue: unknown) {
    // Apply the edit
    await supabase.from('servers').update({ [fieldName]: newValue }).eq('id', serverId)
    // Mark as approved
    await supabase.from('edits').update({ status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', editId)
    fetchData()
  }

  async function rejectEdit(editId: string) {
    await supabase.from('edits').update({ status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', editId)
    fetchData()
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-text-muted">Sign in to access admin panel.</p>
      </div>
    )
  }

  if (role && role !== 'admin' && role !== 'maintainer') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-text-muted">You don&apos;t have admin access.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin Panel</h1>
          <p className="text-xs text-text-muted">Signed in as @{user.user_metadata?.user_name} ({role})</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(['servers', 'users', 'edits'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-accent text-accent font-medium' : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <p className="text-text-muted text-sm">Loading...</p>}

      {/* Servers tab */}
      {tab === 'servers' && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary text-left">
                <th className="px-3 py-2 font-medium">Server</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Health</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {servers.map(s => (
                <tr key={s.id} className="border-b border-border hover:bg-bg-secondary/50">
                  <td className="px-3 py-2">
                    <Link href={`/s/${s.slug}`} className="text-accent hover:text-accent-hover font-medium">{s.name}</Link>
                  </td>
                  <td className="px-3 py-2">{s.score_total}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      s.health_status === 'active' ? 'bg-green/10 text-green' :
                      s.health_status === 'stale' ? 'bg-yellow/10 text-yellow' :
                      'bg-bg-tertiary text-text-muted'
                    }`}>{s.health_status}</span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{s.author_type}</td>
                  <td className="px-3 py-2 text-text-muted">{s.source}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleVerified(s.id, s.verified)}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          s.verified ? 'border-green text-green' : 'border-border text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {s.verified ? '✓ Verified' : 'Verify'}
                      </button>
                      <button
                        onClick={() => toggleArchived(s.id, s.is_archived)}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          s.is_archived ? 'border-red text-red' : 'border-border text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {s.is_archived ? 'Unarchive' : 'Archive'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && !loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-secondary text-left">
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Servers</th>
                <th className="px-3 py-2 font-medium">Edits</th>
                <th className="px-3 py-2 font-medium">Discussions</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border hover:bg-bg-secondary/50">
                  <td className="px-3 py-2">
                    <Link href={`/profile/${u.username}`} className="text-accent hover:text-accent-hover">@{u.username}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      u.role === 'admin' ? 'bg-red/10 text-red' :
                      u.role === 'maintainer' ? 'bg-accent/10 text-accent' :
                      u.role === 'editor' ? 'bg-green/10 text-green' :
                      'bg-bg-tertiary text-text-muted'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{u.servers_submitted}</td>
                  <td className="px-3 py-2 text-text-muted">{u.edits_approved}</td>
                  <td className="px-3 py-2 text-text-muted">{u.discussions_count}</td>
                  <td className="px-3 py-2 text-text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="text-xs border border-border rounded px-2 py-0.5 bg-bg text-text-primary"
                    >
                      <option value="contributor">Contributor</option>
                      <option value="editor">Editor</option>
                      <option value="maintainer">Maintainer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edits tab */}
      {tab === 'edits' && !loading && (
        <div className="space-y-3">
          {edits.length === 0 && <p className="text-text-muted text-sm">No edit proposals yet.</p>}
          {edits.map(e => (
            <div key={e.id} className="border border-border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">@{e.profile?.username}</span>
                  <span className="text-xs text-text-muted">wants to edit</span>
                  <Link href={`/s/${e.server?.slug}`} className="text-sm text-accent hover:text-accent-hover">{e.server?.name}</Link>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  e.status === 'pending' ? 'bg-yellow/10 text-yellow' :
                  e.status === 'approved' ? 'bg-green/10 text-green' :
                  'bg-red/10 text-red'
                }`}>{e.status}</span>
              </div>

              <div className="text-sm mb-2">
                <span className="text-text-muted">Field:</span> <code className="font-mono text-text-primary">{e.field_name}</code>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs mb-2">
                <div>
                  <span className="text-text-muted">Old:</span>
                  <div className="mt-1 p-2 bg-red/5 border border-border rounded font-mono truncate">{JSON.stringify(e.old_value)}</div>
                </div>
                <div>
                  <span className="text-text-muted">New:</span>
                  <div className="mt-1 p-2 bg-green/5 border border-border rounded font-mono truncate">{JSON.stringify(e.new_value)}</div>
                </div>
              </div>

              {e.edit_reason && (
                <p className="text-xs text-text-muted italic mb-2">&ldquo;{e.edit_reason}&rdquo;</p>
              )}

              {e.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => approveEdit(e.id, e.server?.slug ? '' : '', e.field_name, e.new_value)}
                    className="text-xs px-3 py-1 rounded bg-green text-white hover:bg-green/80"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rejectEdit(e.id)}
                    className="text-xs px-3 py-1 rounded border border-red text-red hover:bg-red/5"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
