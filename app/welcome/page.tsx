'use client'

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
  const [step, setStep] = useState<1 | 2>(1)
  const [finalUsername, setFinalUsername] = useState('')
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
      setFinalUsername(json.username || availability.normalized)
      setStep(2)
      setSubmitting(false)
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

  if (step === 2) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green/10 text-green text-2xl mb-4" aria-hidden="true">
            🎉
          </div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            You&apos;re in, @{finalUsername}
          </h1>
          <p className="text-sm text-text-muted">
            Welcome to MCPpedia. Here&apos;s how contributions work.
          </p>
        </div>

        {/* Karma ladder */}
        <div className="border border-border rounded-lg p-4 mb-6 bg-bg-secondary/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-primary">Your karma</span>
            <span className="text-sm font-semibold tabular-nums text-text-primary">0</span>
          </div>
          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mb-3">
            <div className="h-full w-[4%] bg-accent rounded-full" />
          </div>
          <p className="text-xs text-text-muted">
            Earn points by contributing. Climb from <span className="font-medium text-text-primary">Newcomer</span> → <span className="font-medium text-text-primary">Contributor</span> → <span className="font-medium text-text-primary">Regular</span> → <span className="font-medium text-text-primary">Core</span> → <span className="font-medium text-text-primary">Maintainer</span>.
          </p>
        </div>

        {/* Action cards */}
        <p className="text-sm text-text-muted mb-3">Good first steps:</p>
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          <Link
            href="/submit"
            className="border border-border rounded-lg p-4 hover:border-accent hover:bg-accent/5 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl" aria-hidden="true">🚀</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent tabular-nums">+15</span>
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-0.5">Submit a server</h3>
            <p className="text-xs text-text-muted">Add an MCP server you know about.</p>
          </Link>
          <Link
            href="/servers"
            className="border border-border rounded-lg p-4 hover:border-accent hover:bg-accent/5 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl" aria-hidden="true">👍</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent tabular-nums">+1 each</span>
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-0.5">Verify servers</h3>
            <p className="text-xs text-text-muted">Mark servers you&apos;ve actually used.</p>
          </Link>
          <Link
            href="/get-started"
            className="border border-border rounded-lg p-4 hover:border-accent hover:bg-accent/5 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl" aria-hidden="true">📖</span>
              <span className="text-xs text-text-muted">Learn</span>
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-0.5">Get started</h3>
            <p className="text-xs text-text-muted">New to MCP? Start here.</p>
          </Link>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.replace(safeNext)}
            className="px-5 py-2 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors"
          >
            Take me to MCPpedia
          </button>
        </div>
      </div>
    )
  }

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
