'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface BotInfo {
  id: string
  name: string
  description: string
  workflow: string | null
  schedule: string
  lastRun: {
    id: string
    status: string
    startedAt: string
    finishedAt: string | null
    durationMs: number | null
    serversProcessed: number
    serversUpdated: number
    errorMessage: string | null
    summary: Record<string, unknown>
  } | null
  recentRuns: {
    id: string
    status: string
    startedAt: string
    durationMs: number | null
    serversProcessed: number
    serversUpdated: number
  }[]
}

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
  server_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  edit_reason: string
  status: string
  created_at: string
  profile: { username: string } | null
  server: { name: string; slug: string } | null
}

interface ChangeRow {
  id: number
  server_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  actor_id: string | null
  actor_label: string | null
  changed_at: string
  actor: { username: string } | null
  server: { name: string; slug: string } | null
}

type Tab = 'servers' | 'users' | 'edits' | 'bots' | 'history'

export default function AdminPage() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('servers')

  const [servers, setServers] = useState<ServerRow[]>([])
  const [serverSearch, setServerSearch] = useState('')
  const [serverPage, setServerPage] = useState(0)
  const [hasMoreServers, setHasMoreServers] = useState(true)
  const [serverCount, setServerCount] = useState<number | null>(null)
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [edits, setEdits] = useState<EditRow[]>([])
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [changeFilter, setChangeFilter] = useState('')
  const [bots, setBots] = useState<BotInfo[]>([])
  const [triggering, setTriggering] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Categorize state
  const [catRunning, setCatRunning] = useState(false)
  const [catProgress, setCatProgress] = useState<{ processed: number; total: number; updated: number; pct: number; sample: string } | null>(null)
  const [catResult, setCatResult] = useState<string | null>(null)

  const PAGE_SIZE = 50

  const fetchServers = useCallback(async (page: number, search: string, append = false) => {
    let query = supabase
      .from('servers')
      .select('id, slug, name, score_total, health_status, is_archived, verified, author_type, source, created_at', { count: 'exact' })

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`)
    }

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const rows = (data || []) as ServerRow[]
    setServers(prev => append ? [...prev, ...rows] : rows)
    setHasMoreServers(rows.length === PAGE_SIZE)
    if (count !== null) setServerCount(count)
  }, [supabase])

  const fetchNonServerData = useCallback(async () => {
    setLoading(true)
    if (tab === 'users') {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(50)
      setUsers((data || []) as ProfileRow[])
    } else if (tab === 'edits') {
      const { data } = await supabase.from('edits').select('*, profile:profiles(username), server:servers(name, slug)').order('created_at', { ascending: false }).limit(50)
      setEdits((data || []) as EditRow[])
    } else if (tab === 'history') {
      const { data } = await supabase
        .from('server_changes')
        .select('*, actor:profiles!actor_id(username), server:servers(name, slug)')
        .order('changed_at', { ascending: false })
        .limit(100)
      setChanges((data || []) as ChangeRow[])
    } else if (tab === 'bots') {
      const res = await fetch('/api/admin/bots')
      if (res.ok) {
        const json = await res.json()
        setBots(json.bots || [])
      }
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

  // Fetch non-server tabs immediately
  useEffect(() => {
    if (!(role === 'admin' || role === 'maintainer')) return
    if (tab !== 'servers') fetchNonServerData()
  }, [role, tab, fetchNonServerData])

  // Initial server load + debounced search
  useEffect(() => {
    if (tab !== 'servers' || !(role === 'admin' || role === 'maintainer')) return
    setLoading(true)
    const timer = setTimeout(() => {
      setServerPage(0)
      fetchServers(0, serverSearch).then(() => setLoading(false))
    }, serverSearch ? 300 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSearch, tab, role, fetchServers])

  async function toggleVerified(serverId: string, current: boolean) {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, verified: !current }),
    })
    if (!res.ok) return
    setServers(prev => prev.map(s => s.id === serverId ? { ...s, verified: !current } : s))
  }

  async function toggleArchived(serverId: string, current: boolean) {
    await fetch('/api/admin/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, archive: !current, reason: 'Admin action' }),
    })
    // Update locally instead of refetching
    setServers(prev => prev.map(s => s.id === serverId ? { ...s, is_archived: !current } : s))
  }

  async function changeRole(userId: string, newRole: string) {
    const res = await fetch('/api/admin/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: newRole }),
    })
    if (!res.ok) return
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
  }

  async function approveEdit(editId: string) {
    const res = await fetch('/api/admin/approve-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_id: editId }),
    })
    if (!res.ok) return
    setEdits(prev => prev.map(e => e.id === editId ? { ...e, status: 'approved' } : e))
  }

  async function runCategorize() {
    setCatRunning(true)
    setCatProgress(null)
    setCatResult(null)
    try {
      const res = await fetch('/api/admin/categorize')
      if (!res.ok || !res.body) { setCatResult('Failed to start'); setCatRunning(false); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m)
          if (!match) continue
          try {
            const data = JSON.parse(match[1])
            if (data.type === 'progress') {
              setCatProgress({ processed: data.processed, total: data.total, updated: data.updated, pct: data.pct, sample: data.sample })
            } else if (data.type === 'done') {
              setCatResult(data.message)
              setCatProgress(null)
            } else if (data.type === 'error') {
              setCatResult(`Error: ${data.message}`)
            }
          } catch { /* skip bad JSON */ }
        }
      }
    } catch (err) {
      setCatResult(`Network error: ${String(err)}`)
    }
    setCatRunning(false)
  }

  async function triggerBot(botId: string) {
    setTriggering(botId)
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot: botId }),
      })
      const json = await res.json()
      if (!res.ok) alert(json.error || 'Failed to trigger bot')
      else alert(json.message)
    } catch {
      alert('Network error')
    }
    setTriggering(null)
  }

  async function rejectEdit(editId: string) {
    const res = await fetch('/api/admin/approve-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_id: editId, reject: true }),
    })
    if (!res.ok) return
    setEdits(prev => prev.map(e => e.id === editId ? { ...e, status: 'rejected' } : e))
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
        <Link
          href="/analytics"
          className="text-sm text-accent hover:text-accent-hover border border-border rounded-md px-3 py-1.5 transition-colors duration-150"
        >
          Analytics
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {(['servers', 'users', 'edits', 'bots', 'history'] as Tab[]).map(t => (
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
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Search servers by name..."
              value={serverSearch}
              onChange={e => {
                setServerSearch(e.target.value)
                setServerPage(0)
              }}
              className="flex-1 max-w-sm px-3 py-1.5 text-sm border border-border rounded bg-bg text-text-primary placeholder:text-text-muted"
            />
            {serverCount !== null && (
              <span className="text-xs text-text-muted">{serverCount.toLocaleString()} servers total</span>
            )}
          </div>
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
          {hasMoreServers && (
            <button
              onClick={() => {
                const nextPage = serverPage + 1
                setServerPage(nextPage)
                fetchServers(nextPage, serverSearch, true)
              }}
              className="mt-4 w-full py-2 text-sm text-accent hover:text-accent-hover border border-border rounded hover:bg-bg-secondary"
            >
              Load more
            </button>
          )}
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
                  <td className="px-3 py-2 text-text-muted text-xs">{new Date(u.created_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}</td>
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
                    onClick={() => approveEdit(e.id)}
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

      {/* Bots tab */}
      {tab === 'bots' && !loading && (
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="border border-border rounded-md p-4">
            <h3 className="font-medium text-text-primary mb-2">Quick Actions</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={runCategorize}
                disabled={catRunning}
                className="text-sm px-4 py-1.5 rounded border border-accent text-accent hover:bg-accent/5 disabled:opacity-50"
              >
                {catRunning ? 'Categorizing...' : 'Categorize all servers'}
              </button>
              {catResult && (
                <span className="text-sm text-green">{catResult}</span>
              )}
            </div>
            {catProgress && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                  <span>{catProgress.processed}/{catProgress.total} processed ({catProgress.updated} updated)</span>
                  <span>{catProgress.pct}%</span>
                </div>
                <div className="w-full bg-border rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all duration-300"
                    style={{ width: `${catProgress.pct}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted mt-1 truncate">{catProgress.sample}</p>
              </div>
            )}
          </div>

          {bots.length === 0 && <p className="text-text-muted text-sm">No bot data available. Run a bot to see results here.</p>}
          {bots.map(bot => (
            <div key={bot.id} className="border border-border rounded-md p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-medium text-text-primary">{bot.name}</h3>
                  <p className="text-xs text-text-muted">{bot.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">{bot.schedule}</span>
                  {bot.workflow ? (
                    <button
                      onClick={() => triggerBot(bot.id)}
                      disabled={triggering === bot.id}
                      className="text-xs px-3 py-1 rounded border border-accent text-accent hover:bg-accent/5 disabled:opacity-50"
                    >
                      {triggering === bot.id ? 'Triggering...' : 'Run now'}
                    </button>
                  ) : (
                    <span className="text-xs text-text-muted italic">Manual only</span>
                  )}
                </div>
              </div>

              {/* Last run details */}
              {bot.lastRun ? (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      bot.lastRun.status === 'success' ? 'bg-green/10 text-green' :
                      bot.lastRun.status === 'running' ? 'bg-accent/10 text-accent' :
                      'bg-red/10 text-red'
                    }`}>
                      {bot.lastRun.status}
                    </span>
                    <span className="text-text-muted">
                      {new Date(bot.lastRun.startedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                    </span>
                    {bot.lastRun.durationMs != null && (
                      <span className="text-text-muted">
                        {bot.lastRun.durationMs < 60000
                          ? `${(bot.lastRun.durationMs / 1000).toFixed(1)}s`
                          : `${Math.round(bot.lastRun.durationMs / 60000)}m`}
                      </span>
                    )}
                    <span className="text-text-muted">
                      {bot.lastRun.serversProcessed} processed / {bot.lastRun.serversUpdated} updated
                    </span>
                  </div>
                  {bot.lastRun.errorMessage && (
                    <pre className="mt-2 text-xs text-red bg-red/5 border border-red/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {bot.lastRun.errorMessage}
                    </pre>
                  )}
                  {bot.lastRun.summary && Object.keys(bot.lastRun.summary).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(bot.lastRun.summary).map(([k, v]) => (
                        <span key={k} className="text-xs bg-bg-tertiary px-2 py-0.5 rounded text-text-muted">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-text-muted mt-2 italic">Never run</p>
              )}

              {/* Recent runs sparkline */}
              {bot.recentRuns.length > 1 && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-xs text-text-muted mb-1">Recent runs</p>
                  <div className="flex gap-1">
                    {bot.recentRuns.map(r => (
                      <div
                        key={r.id}
                        title={`${new Date(r.startedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} — ${r.status} — ${r.serversProcessed} processed`}
                        className={`w-3 h-3 rounded-sm ${
                          r.status === 'success' ? 'bg-green' :
                          r.status === 'running' ? 'bg-accent' :
                          'bg-red'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && !loading && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Filter by server, field, or actor..."
              value={changeFilter}
              onChange={e => setChangeFilter(e.target.value)}
              className="flex-1 max-w-sm px-3 py-1.5 text-sm border border-border rounded bg-bg text-text-primary placeholder:text-text-muted"
            />
            <span className="text-xs text-text-muted">{changes.length} recent change{changes.length === 1 ? '' : 's'}</span>
          </div>
          <div className="space-y-2">
            {changes.length === 0 && <p className="text-text-muted text-sm">No changes logged yet.</p>}
            {changes
              .filter(c => {
                if (!changeFilter.trim()) return true
                const q = changeFilter.toLowerCase()
                return (
                  c.server?.slug.toLowerCase().includes(q) ||
                  c.server?.name.toLowerCase().includes(q) ||
                  c.field_name.toLowerCase().includes(q) ||
                  c.actor?.username?.toLowerCase().includes(q) ||
                  c.actor_label?.toLowerCase().includes(q)
                )
              })
              .map(c => {
                const isDelete = c.field_name === '__deleted__'
                const actorDisplay = c.actor?.username
                  ? `@${c.actor.username}`
                  : c.actor_label || 'unknown'
                return (
                  <div key={c.id} className="border border-border rounded-md p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-text-primary font-medium truncate">{actorDisplay}</span>
                        <span className="text-text-muted text-xs">
                          {isDelete ? 'deleted' : 'changed'}
                        </span>
                        {!isDelete && (
                          <code className="text-xs font-mono text-accent">{c.field_name}</code>
                        )}
                        <span className="text-text-muted text-xs">on</span>
                        {c.server ? (
                          <Link href={`/s/${c.server.slug}`} className="text-accent hover:text-accent-hover truncate">
                            {c.server.name}
                          </Link>
                        ) : (
                          <span className="text-text-muted italic text-xs">(deleted server)</span>
                        )}
                      </div>
                      <span className="text-xs text-text-muted whitespace-nowrap ml-2">
                        {new Date(c.changed_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })}
                      </span>
                    </div>
                    {!isDelete && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-1.5 bg-red/5 border border-border rounded font-mono truncate" title={JSON.stringify(c.old_value)}>
                          {JSON.stringify(c.old_value) ?? 'null'}
                        </div>
                        <div className="p-1.5 bg-green/5 border border-border rounded font-mono truncate" title={JSON.stringify(c.new_value)}>
                          {JSON.stringify(c.new_value) ?? 'null'}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
