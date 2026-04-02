'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Server } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'

export default function EditServerPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [server, setServer] = useState<Server | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  const [error, setError] = useState('')

  // Form state — all editable fields
  const [form, setForm] = useState({
    name: '',
    tagline: '',
    description: '',
    install_configs: '',
    tools: '',
    resources: '',
    api_name: '',
    api_pricing: '',
    api_rate_limits: '',
    homepage_url: '',
    npm_package: '',
    pip_package: '',
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single().then(({ data: p }) => {
          setIsAdmin(p?.role === 'admin' || p?.role === 'maintainer')
        })
      }
    })
    supabase.from('servers').select('*').eq('slug', slug).single().then(({ data }) => {
      if (data) {
        const s = data as Server
        setServer(s)
        setForm({
          name: s.name || '',
          tagline: s.tagline || '',
          description: s.description || '',
          install_configs: JSON.stringify(s.install_configs, null, 2) || '{}',
          tools: JSON.stringify(s.tools, null, 2) || '[]',
          resources: JSON.stringify(s.resources, null, 2) || '[]',
          api_name: s.api_name || '',
          api_pricing: s.api_pricing || 'unknown',
          api_rate_limits: s.api_rate_limits || '',
          homepage_url: s.homepage_url || '',
          npm_package: s.npm_package || '',
          pip_package: s.pip_package || '',
        })
      }
    })
  }, [slug, supabase])

  async function handleSaveField(fieldName: string) {
    if (!server || !user) return
    setSaving(true)
    setError('')

    const value = form[fieldName as keyof typeof form]
    const isJson = ['install_configs', 'tools', 'resources'].includes(fieldName)

    if (isAdmin) {
      // Admin: save directly
      const update: Record<string, unknown> = {}
      if (isJson) {
        try { update[fieldName] = JSON.parse(value) }
        catch { setError(`Invalid JSON in ${fieldName}`); setSaving(false); return }
      } else {
        update[fieldName] = value || null
      }

      const { error: err } = await supabase.from('servers').update(update).eq('id', server.id)
      if (err) { setError(err.message) }
      else { setSaved(prev => [...prev, fieldName]) }
    } else {
      // Regular user: propose edit
      const oldValue = server[fieldName as keyof Server]
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: server.id,
          field_name: fieldName,
          old_value: String(oldValue ?? ''),
          new_value: value,
          edit_reason: `Updated ${fieldName}`,
        }),
      })
      if (res.ok) { setSaved(prev => [...prev, fieldName]) }
      else { setError('Failed to submit edit') }
    }
    setSaving(false)
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Edit Server</h1>
        <p className="text-text-muted mb-6">Sign in to edit this page.</p>
        <a href={`/login?redirect=/s/${slug}/edit`} className="text-accent hover:text-accent-hover">Sign in with GitHub</a>
      </div>
    )
  }

  if (!server) return <div className="max-w-3xl mx-auto px-4 py-12 text-text-muted">Loading...</div>

  function Field({ name, label, type = 'text', rows = 1 }: { name: string; label: string; type?: 'text' | 'textarea' | 'json' | 'select'; rows?: number }) {
    const fieldSaved = saved.includes(name)
    const value = form[name as keyof typeof form]

    return (
      <div className="border border-border rounded-md p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{label}</label>
          <div className="flex items-center gap-2">
            {fieldSaved && <span className="text-xs text-green">{isAdmin ? 'Saved!' : 'Proposed!'}</span>}
            <button
              onClick={() => handleSaveField(name)}
              disabled={saving}
              className="px-3 py-1 text-xs rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {isAdmin ? 'Save' : 'Propose'}
            </button>
          </div>
        </div>

        {type === 'select' ? (
          <select
            value={value}
            onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="free">Free</option>
            <option value="freemium">Freemium</option>
            <option value="paid">Paid</option>
            <option value="unknown">Unknown</option>
          </select>
        ) : type === 'textarea' || type === 'json' ? (
          <textarea
            value={value}
            onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
            rows={rows}
            className={`w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent resize-y ${type === 'json' ? 'font-mono text-xs' : ''}`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
          />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Edit: {server.name}</h1>
          <p className="text-sm text-text-muted">
            {isAdmin ? 'Admin mode — changes save directly.' : 'Your changes will be reviewed before going live.'}
          </p>
        </div>
        <Link href={`/s/${slug}`} className="text-sm text-text-muted hover:text-text-primary border border-border rounded-md px-3 py-1.5">
          Back to page
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red bg-red/5 text-sm text-red">{error}</div>
      )}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Basic Info</h2>
        <Field name="name" label="Name" />
        <Field name="tagline" label="Tagline" />
        <Field name="homepage_url" label="Homepage URL" />
        <Field name="npm_package" label="npm Package" />
        <Field name="pip_package" label="pip Package" />

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">Quick Install Config</h2>
        <Field name="install_configs" label="Install Config (JSON)" type="json" rows={12} />

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">About</h2>
        <Field name="description" label="Description" type="textarea" rows={6} />

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">Tools & Resources</h2>
        <Field name="tools" label="Tools (JSON array)" type="json" rows={10} />
        <Field name="resources" label="Resources (JSON array)" type="json" rows={6} />

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">API Info</h2>
        <Field name="api_name" label="API Name" />
        <Field name="api_pricing" label="API Pricing" type="select" />
        <Field name="api_rate_limits" label="Rate Limits" />
      </div>
    </div>
  )
}
