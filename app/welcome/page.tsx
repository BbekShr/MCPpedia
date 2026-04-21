'use client'

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, validateUsername } from '@/lib/username'

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; normalized: string }
  | { status: 'unavailable'; reason: string }

function WelcomeForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [initialUsername, setInitialUsername] = useState('')
  const [username, setUsername] = useState('')
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const checkSeq = useRef(0)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace(`/login?redirect=${encodeURIComponent('/welcome?next=' + safeNext)}`)
        return
      }
      setAuthed(true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, username_set')
        .eq('id', data.user.id)
        .single()

      if (profile?.username_set) {
        router.replace(safeNext)
        return
      }
      if (profile?.username) {
        setInitialUsername(profile.username)
        setUsername(profile.username)
      }
      setLoading(false)
    })
  }, [supabase, router, safeNext])

  const runCheck = useCallback(async (candidate: string) => {
    const seq = ++checkSeq.current
    const validation = validateUsername(candidate)
    if (!validation.ok) {
      setAvailability({ status: 'unavailable', reason: validation.reason })
      return
    }
    if (validation.normalized === initialUsername) {
      // Same as the placeholder — don't spam the API; treat as available.
      setAvailability({ status: 'available', normalized: validation.normalized })
      return
    }
    setAvailability({ status: 'checking' })
    try {
      const res = await fetch(`/api/username?candidate=${encodeURIComponent(validation.normalized)}`)
      const json = await res.json()
      if (seq !== checkSeq.current) return // stale response
      if (json.available) {
        setAvailability({ status: 'available', normalized: validation.normalized })
      } else {
        setAvailability({ status: 'unavailable', reason: json.reason || 'Not available.' })
      }
    } catch {
      if (seq !== checkSeq.current) return
      setAvailability({ status: 'unavailable', reason: 'Could not check availability.' })
    }
  }, [initialUsername])

  useEffect(() => {
    if (!authed || loading) return
    if (!username) {
      setAvailability({ status: 'idle' })
      return
    }
    const timer = setTimeout(() => runCheck(username), 300)
    return () => clearTimeout(timer)
  }, [username, authed, loading, runCheck])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    if (availability.status !== 'available') return
    setSubmitting(true)
    try {
      const res = await fetch('/api/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: availability.normalized }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(json.error || 'Could not save username.')
        setSubmitting(false)
        return
      }
      router.replace(safeNext)
    } catch {
      setSubmitError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-text-muted text-sm">Loading…</p>
      </div>
    )
  }

  const canSubmit = availability.status === 'available' && !submitting

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Pick a username</h1>
        <p className="text-sm text-text-muted">
          This is how you&apos;ll show up on MCPpedia. You can change it later in settings.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="username" className="block text-sm font-medium text-text-primary mb-1.5">
          Username
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
          <input
            id="username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
            placeholder="your-handle"
            autoFocus
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            minLength={USERNAME_MIN_LENGTH}
            maxLength={USERNAME_MAX_LENGTH}
            className="w-full pl-7 pr-10 py-2.5 rounded-md border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {availability.status === 'checking' && (
              <span className="text-xs text-text-muted">…</span>
            )}
            {availability.status === 'available' && (
              <span className="text-green text-sm" aria-hidden="true">✓</span>
            )}
            {availability.status === 'unavailable' && (
              <span className="text-red text-sm" aria-hidden="true">✗</span>
            )}
          </div>
        </div>

        <div className="min-h-[1.5rem] mt-1.5">
          {availability.status === 'unavailable' && (
            <p className="text-xs text-red">{availability.reason}</p>
          )}
          {availability.status === 'available' && (
            <p className="text-xs text-green">@{availability.normalized} is available.</p>
          )}
        </div>

        <ul className="text-xs text-text-muted list-disc pl-5 mt-4 space-y-0.5">
          <li>{USERNAME_MIN_LENGTH}–{USERNAME_MAX_LENGTH} characters.</li>
          <li>Lowercase letters, numbers, hyphens, and underscores.</li>
          <li>Must start and end with a letter or number.</li>
          <li>No reserved names (admin, api, mcppedia, …).</li>
        </ul>

        {submitError && (
          <div className="mt-4 p-3 rounded-md border border-red bg-red/5 text-sm text-red">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-6 w-full px-4 py-2.5 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeForm />
    </Suspense>
  )
}
