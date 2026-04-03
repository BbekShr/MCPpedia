'use client'

import { useState, useEffect } from 'react'

const THRESHOLD = 3

export default function CommunityVerify({ serverId, initialCount }: { serverId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount)
  const [userVerified, setUserVerified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    fetch(`/api/community-verify?server_id=${serverId}`)
      .then(r => r.json())
      .then(d => {
        setUserVerified(d.user_verified)
        setChecked(true)
      })
      .catch(() => setChecked(true))
  }, [serverId])

  async function toggle() {
    setLoading(true)
    try {
      const res = await fetch('/api/community-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId }),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      setCount(data.count)
      setUserVerified(data.user_verified)
    } catch { /* ignore */ }
    setLoading(false)
  }

  if (!checked) return null

  const isVerified = count >= THRESHOLD

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
          userVerified
            ? 'border-green bg-green/10 text-green'
            : 'border-border text-text-muted hover:text-text-primary hover:border-text-muted'
        } disabled:opacity-50`}
      >
        <span>{userVerified ? '✓' : '+'}</span>
        {userVerified ? 'Verified by you' : 'I\'ve used this'}
      </button>
      <span className="text-xs text-text-muted">
        {count} {count === 1 ? 'person has' : 'people have'} verified
        {isVerified ? '' : ` (${THRESHOLD - count} more needed)`}
      </span>
    </div>
  )
}
