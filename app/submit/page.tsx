'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, CATEGORY_LABELS, TRANSPORTS, API_PRICING_OPTIONS } from '@/lib/constants'
import type { Category } from '@/lib/constants'
import type { User } from '@supabase/supabase-js'
import { useEffect } from 'react'
import Link from 'next/link'

function SubmitForm() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [step, setStep] = useState(1)

  const [githubUrl, setGithubUrl] = useState('')
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [license, setLicense] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorGithub, setAuthorGithub] = useState('')
  const [npmPackage, setNpmPackage] = useState('')
  const [pipPackage, setPipPackage] = useState('')
  const [transport, setTransport] = useState<string[]>(['stdio'])
  const [categories, setCategories] = useState<string[]>([])
  const [apiPricing, setApiPricing] = useState('unknown')
  const [requiresApiKey, setRequiresApiKey] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
  }, [supabase.auth])

  async function handleAutoFill() {
    if (!githubUrl) return
    setFetching(true)
    setError('')

    try {
      const res = await fetch(`/api/github-metadata?url=${encodeURIComponent(githubUrl)}`)
      if (!res.ok) {
        setError('Could not fetch repository metadata')
        setFetching(false)
        return
      }

      const meta = await res.json()
      setName(meta.name || '')
      setTagline(meta.description || '')
      setLicense(meta.license || '')
      setAuthorName(meta.owner || '')
      setAuthorGithub(meta.owner || '')
      if (meta.name) setStep(2)
    } catch {
      setError('Failed to fetch metadata')
    }
    setFetching(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        github_url: githubUrl,
        name,
        tagline,
        license,
        author_name: authorName,
        author_github: authorGithub,
        npm_package: npmPackage || undefined,
        pip_package: pipPackage || undefined,
        transport,
        categories,
        api_pricing: apiPricing,
        requires_api_key: requiresApiKey,
      }),
    })

    if (res.ok) {
      setSuccess(true)
      const data = await res.json()
      setTimeout(() => router.push(`/s/${data.server.slug}`), 2000)
    } else {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'Submission failed')
    }
    setSubmitting(false)
  }

  function toggleTransport(t: string) {
    setTransport(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  function toggleCategory(c: string) {
    setCategories(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-text-muted">Loading...</div>

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-3">Add a server to MCPpedia</h1>
        <p className="text-text-muted mb-2 max-w-md mx-auto">
          Help the MCP community discover great servers. Submit yours and it will be automatically scored on security, maintenance, and efficiency.
        </p>
        <p className="text-sm text-text-muted mb-8">It takes about 30 seconds.</p>
        <a
          href="/login?redirect=/submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent text-white hover:bg-accent-hover transition-colors font-medium"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Sign in with GitHub
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green/10 flex items-center justify-center mx-auto mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-3">Server submitted!</h1>
        <p className="text-text-muted mb-2">Your server will be scored automatically within a few minutes.</p>
        <p className="text-sm text-text-muted">Redirecting to the server page...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
          <Link href="/" className="hover:text-accent transition-colors">Home</Link>
          <span className="text-text-muted/50">/</span>
          <span className="text-text-primary font-medium">Submit a server</span>
        </nav>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Add a server to MCPpedia</h1>
        <p className="text-text-muted text-sm">
          Paste a GitHub URL and we&apos;ll auto-fill most fields. Your server will be scored on security, maintenance, and efficiency within minutes.
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-8" aria-label="Form progress">
        {[
          { num: 1, label: 'Repository' },
          { num: 2, label: 'Details' },
          { num: 3, label: 'Classify' },
        ].map(({ num, label }) => (
          <div key={num} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              step >= num ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-muted'
            }`}>
              {step > num ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : num}
            </div>
            <span className={`text-xs font-medium ${step >= num ? 'text-text-primary' : 'text-text-muted'}`}>
              {label}
            </span>
            {num < 3 && <div className={`flex-1 h-px ${step > num ? 'bg-accent' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-md border border-red bg-red/5 text-sm text-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: GitHub URL */}
        <div className="p-5 border border-border rounded-lg bg-bg-secondary space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary">Step 1: Repository</span>
            <span className="text-xs text-text-muted">Paste your GitHub URL and hit Auto-fill</span>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              required
              className="flex-1 px-3 py-2.5 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              aria-label="GitHub repository URL"
            />
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={fetching || !githubUrl}
              className="px-5 py-2.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0 font-medium"
            >
              {fetching ? 'Fetching...' : 'Auto-fill'}
            </button>
          </div>
          <p className="text-xs text-text-muted">
            We&apos;ll pull the name, description, license, and author from your repo.
          </p>
        </div>

        {/* Step 2: Basic info */}
        <div className={`space-y-4 transition-opacity ${step >= 2 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary">Step 2: Server details</span>
            <span className="text-xs text-text-muted">Verify and add any missing info</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); if (e.target.value) setStep(Math.max(step, 2)) }}
              required
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Tagline</label>
            <input
              type="text"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="One-line description of what it does"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Author</label>
              <input
                type="text"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">License</label>
              <input
                type="text"
                value={license}
                onChange={e => setLicense(e.target.value)}
                placeholder="MIT, Apache-2.0, etc."
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">npm package</label>
              <input
                type="text"
                value={npmPackage}
                onChange={e => setNpmPackage(e.target.value)}
                placeholder="@scope/package"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">pip package</label>
              <input
                type="text"
                value={pipPackage}
                onChange={e => setPipPackage(e.target.value)}
                placeholder="mcp-server-name"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Classify */}
        <div className={`space-y-6 transition-opacity ${step >= 2 ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
          onFocus={() => setStep(3)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary">Step 3: Classification</span>
            <span className="text-xs text-text-muted">Help users find your server</span>
          </div>

          {/* Transport */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Transport</label>
            <div className="flex gap-3">
              {TRANSPORTS.map(t => (
                <label key={t} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border cursor-pointer transition-colors min-h-[40px] ${
                  transport.includes(t)
                    ? 'border-accent bg-accent/5 text-accent font-medium'
                    : 'border-border text-text-muted hover:border-accent/30'
                }`}>
                  <input
                    type="checkbox"
                    checked={transport.includes(t)}
                    onChange={() => toggleTransport(t)}
                    className="sr-only"
                  />
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-white ${
                    transport.includes(t) ? 'bg-accent border-accent' : 'border-border'
                  }`}>
                    {transport.includes(t) && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  {t.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Categories (select all that apply)</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors min-h-[36px] ${
                    categories.includes(c)
                      ? 'border-accent bg-accent/10 text-accent font-medium'
                      : 'border-border text-text-muted hover:border-accent/30 hover:text-text-primary'
                  }`}
                >
                  {CATEGORY_LABELS[c as Category]}
                </button>
              ))}
            </div>
          </div>

          {/* API info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">API Pricing</label>
              <select
                value={apiPricing}
                onChange={e => setApiPricing(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {API_PRICING_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border cursor-pointer transition-colors min-h-[40px] ${
                requiresApiKey
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-border text-text-muted'
              }`}>
                <input
                  type="checkbox"
                  checked={requiresApiKey}
                  onChange={e => setRequiresApiKey(e.target.checked)}
                  className="sr-only"
                />
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-white ${
                  requiresApiKey ? 'bg-accent border-accent' : 'border-border'
                }`}>
                  {requiresApiKey && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                Requires API key
              </label>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !name}
          className="w-full px-4 py-3 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors text-base"
        >
          {submitting ? 'Submitting...' : 'Submit server'}
        </button>

        <p className="text-xs text-text-muted text-center">
          After submission, our bots will scan your server for CVEs, extract tools, and compute a security score.
          The process usually takes 2-5 minutes.
        </p>
      </form>

      {/* What happens next */}
      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-sm font-semibold text-text-primary mb-4">What happens after you submit?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 text-xs font-bold text-accent">1</div>
            <div>
              <p className="text-sm font-medium text-text-primary">Auto-scan</p>
              <p className="text-xs text-text-muted">We check for CVEs, extract tools, and analyze the README.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 text-xs font-bold text-accent">2</div>
            <div>
              <p className="text-sm font-medium text-text-primary">Score & grade</p>
              <p className="text-xs text-text-muted">Your server gets a 0-100 score across 5 dimensions.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 text-xs font-bold text-accent">3</div>
            <div>
              <p className="text-sm font-medium text-text-primary">Go live</p>
              <p className="text-xs text-text-muted">Your server page goes live with install configs and badges.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SubmitPage() {
  return (
    <Suspense>
      <SubmitForm />
    </Suspense>
  )
}
