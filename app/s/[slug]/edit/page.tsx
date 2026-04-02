'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Server } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

const EDITABLE_FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'tagline', label: 'Tagline', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'api_name', label: 'API Name', type: 'text' },
  { key: 'api_pricing', label: 'API Pricing', type: 'select', options: ['free', 'freemium', 'paid', 'unknown'] },
  { key: 'api_rate_limits', label: 'API Rate Limits', type: 'text' },
] as const

export default function EditServerPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [server, setServer] = useState<Server | null>(null)
  const [selectedField, setSelectedField] = useState('')
  const [newValue, setNewValue] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    supabase
      .from('servers')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (data) setServer(data as Server)
      })
  }, [slug, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!server || !selectedField || !reason) return
    setSubmitting(true)
    setError('')

    const oldValue = server[selectedField as keyof Server]

    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_id: server.id,
        field_name: selectedField,
        old_value: oldValue,
        new_value: newValue,
        edit_reason: reason,
      }),
    })

    if (res.ok) {
      setSuccess(true)
      setTimeout(() => router.push(`/s/${slug}`), 2000)
    } else {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'Failed to submit edit')
    }
    setSubmitting(false)
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Edit Server</h1>
        <p className="text-text-muted mb-6">Sign in to propose edits.</p>
        <a href={`/login?redirect=/s/${slug}/edit`} className="text-accent hover:text-accent-hover">
          Sign in with GitHub
        </a>
      </div>
    )
  }

  if (!server) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-text-muted">Loading...</div>
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Edit proposed!</h1>
        <p className="text-text-muted">Your edit will be reviewed. Redirecting...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        Edit: {server.name}
      </h1>
      <p className="text-sm text-text-muted mb-8">
        Propose a change. Editors will review your submission.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red bg-red/5 text-sm text-red">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Field to edit</label>
          <select
            value={selectedField}
            onChange={e => {
              setSelectedField(e.target.value)
              const current = server[e.target.value as keyof Server]
              setNewValue(current != null ? String(current) : '')
            }}
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
            required
          >
            <option value="">Select a field...</option>
            {EDITABLE_FIELDS.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>

        {selectedField && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Current value</label>
              <div className="px-3 py-2 text-sm border border-border rounded-md bg-bg-secondary text-text-muted">
                {String(server[selectedField as keyof Server] ?? '(empty)')}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">New value</label>
              {EDITABLE_FIELDS.find(f => f.key === selectedField)?.type === 'textarea' ? (
                <textarea
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent resize-none"
                />
              ) : EDITABLE_FIELDS.find(f => f.key === selectedField)?.type === 'select' ? (
                <select
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
                >
                  {(EDITABLE_FIELDS.find(f => f.key === selectedField) as unknown as { options: string[] })?.options?.map((o: string) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Reason for edit *</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this change needed?"
            required
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedField || !reason}
          className="w-full px-4 py-2.5 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting...' : 'Propose edit'}
        </button>
      </form>
    </div>
  )
}
