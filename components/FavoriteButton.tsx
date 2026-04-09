'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  serverId: string
  className?: string
}

export default function FavoriteButton({ serverId, className = '' }: Props) {
  const [favorited, setFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setIsLoggedIn(true)
      // Check if this server is favorited
      supabase
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('server_id', serverId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setFavorited(true)
        })
    })
  }, [serverId])

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isLoggedIn) {
      // Redirect to login
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId }),
      })
      const data = await res.json()
      if (res.ok) {
        setFavorited(data.favorited)
      }
    } finally {
      setLoading(false)
    }
  }, [serverId, isLoggedIn])

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`group inline-flex items-center justify-center transition-colors ${className}`}
      title={favorited ? 'Remove from My Servers' : 'Save to My Servers'}
      aria-label={favorited ? 'Remove from My Servers' : 'Save to My Servers'}
      aria-pressed={favorited}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={favorited ? 'var(--red)' : 'none'}
        stroke={favorited ? 'var(--red)' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-all ${loading ? 'opacity-50' : ''} ${favorited ? '' : 'group-hover:stroke-[var(--red)] group-hover:scale-110'}`}
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}
