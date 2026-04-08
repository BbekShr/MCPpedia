'use client'

import { useState } from 'react'

interface NewsletterSignupProps {
  variant?: 'inline' | 'banner'
  context?: string
}

export default function NewsletterSignup({
  variant = 'inline',
  context = 'Get weekly MCP security insights and new server roundups.',
}: NewsletterSignupProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('success')
        setEmail('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className={`${variant === 'banner' ? 'rounded-lg border border-green/20 bg-green/5 p-5' : 'rounded-md border border-green/20 bg-green/5 p-4'}`}>
        <p className="text-sm font-medium text-green">&#10003; You&apos;re subscribed!</p>
        <p className="text-xs text-text-muted mt-1">You&apos;ll get weekly MCP security digests and new server roundups.</p>
      </div>
    )
  }

  if (variant === 'banner') {
    return (
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-text-primary mb-1">MCP Security Weekly</h3>
            <p className="text-sm text-text-muted">{context}</p>
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-bg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent w-48"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-60 shrink-0"
            >
              {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
        </div>
        {status === 'error' && <p className="text-xs text-red mt-2">Something went wrong. Please try again.</p>}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-bg-secondary p-4">
      <p className="text-sm font-medium text-text-primary mb-1">MCP Security Weekly</p>
      <p className="text-xs text-text-muted mb-3">{context}</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-bg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-60 shrink-0"
        >
          {status === 'loading' ? '…' : 'Subscribe'}
        </button>
      </form>
      {status === 'error' && <p className="text-xs text-red mt-2">Something went wrong. Please try again.</p>}
    </div>
  )
}
