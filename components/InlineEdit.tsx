'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface Props {
  serverId: string
  fieldName: string
  currentValue: string
  inputType?: 'text' | 'textarea' | 'json'
  label: string
}

export default function InlineEdit({ serverId, fieldName, currentValue, inputType = 'text', label }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentValue)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single().then(({ data: p }) => {
          setIsAdmin(p?.role === 'admin' || p?.role === 'maintainer')
        })
      }
    })
  }, [supabase])

  async function handleSubmit() {
    if (!user || value === currentValue) return
    setSubmitting(true)

    if (isAdmin) {
      // Admin: save directly
      const update: Record<string, unknown> = {}

      if (inputType === 'json') {
        try {
          update[fieldName] = JSON.parse(value)
        } catch {
          alert('Invalid JSON')
          setSubmitting(false)
          return
        }
      } else {
        update[fieldName] = value
      }

      await supabase.from('servers').update(update).eq('id', serverId)
      setEditing(false)
      setSubmitted(true)
      setTimeout(() => window.location.reload(), 500)
    } else {
      // Regular user: submit as edit proposal
      await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverId,
          field_name: fieldName,
          old_value: currentValue,
          new_value: value,
          edit_reason: reason || `Updated ${label}`,
        }),
      })
      setEditing(false)
      setSubmitted(true)
    }
    setSubmitting(false)
  }

  if (!user) return null

  if (submitted) {
    return (
      <span className="text-xs text-green">
        {isAdmin ? 'Saved!' : 'Edit proposed — pending review'}
      </span>
    )
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
        title={`Edit ${label}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>
    )
  }

  return (
    <div className="mt-2 border border-accent/30 rounded-md p-3 bg-accent/5 space-y-2">
      {inputType === 'textarea' || inputType === 'json' ? (
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          rows={inputType === 'json' ? 10 : 4}
          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary font-mono focus:outline-none focus:border-accent resize-y"
          placeholder={inputType === 'json' ? 'Paste JSON...' : `Enter ${label}...`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent"
          placeholder={`Enter ${label}...`}
        />
      )}

      {!isAdmin && (
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why this change? (optional)"
          className="w-full px-2 py-1.5 text-xs border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent"
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || value === currentValue}
          className="px-3 py-1 text-xs rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? 'Saving...' : isAdmin ? 'Save' : 'Propose edit'}
        </button>
        <button
          onClick={() => { setEditing(false); setValue(currentValue) }}
          className="px-3 py-1 text-xs text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      {isAdmin && (
        <p className="text-[10px] text-text-muted">Admin: saves directly, no review needed</p>
      )}
    </div>
  )
}
