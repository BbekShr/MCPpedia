'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, CATEGORY_LABELS, TRANSPORTS, API_PRICING_OPTIONS } from '@/lib/constants'
import type { Category } from '@/lib/constants'
import type { User } from '@supabase/supabase-js'
import { useEffect } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { Brand } from '@/components/ui/brand-marks'

function SubmitForm() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<{ slug: string; name: string; url: string } | null>(null)
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
        const data = await res.json().catch(() => null)
        setError(
          (typeof data?.error === 'string' ? data.error : 'Could not fetch repository metadata.') +
          ' Auto-fill is optional - you can enter the details yourself.'
        )
        // Auto-fill is a convenience; never block manual entry on its failure.
        setStep(s => Math.max(s, 2))
        setFetching(false)
        return
      }

      const meta = await res.json()
      setName(meta.name || '')
      setTagline(meta.description || '')
      setLicense(meta.license || '')
      setAuthorName(meta.owner || '')
      setAuthorGithub(meta.owner || '')
      setStep(s => Math.max(s, 2))
    } catch {
      setError('Failed to fetch metadata. Auto-fill is optional - you can enter the details yourself.')
      setStep(s => Math.max(s, 2))
    }
    setFetching(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setDuplicate(null)

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
      if (res.status === 409 && data.existing?.slug) {
        setDuplicate(data.existing)
        setError(data.message || 'This server is already on MCPpedia.')
      } else {
        setError(typeof data.error === 'string' ? data.error : data.message || 'Submission failed')
      }
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
          <Icon name="plus" size={28} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-3">Add a server to MCPpedia</h1>
        <p className="text-text-muted mb-2 max-w-md mx-auto">
          Help the MCP community discover great servers. Submit yours and it will be automatically scored on security, maintenance, and efficiency.
        </p>
        <p className="text-sm text-text-muted mb-8">It takes about 30 seconds.</p>
        <a
          href="/login?redirect=/submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors font-medium"
        >
          <Brand name="github" size={18} />
          Sign in with GitHub
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green/10 flex items-center justify-center mx-auto mb-6">
          <Icon name="check" size={28} style={{ color: 'var(--green)' }} />
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
              step >= num ? 'bg-accent text-accent-fg' : 'bg-bg-tertiary text-text-muted'
            }`}>
              {step > num ? (
                <Icon name="check" size={14} />
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
          <div>{error}</div>
          {duplicate && (
            <div className="mt-2 text-text-primary">
              <Link href={duplicate.url} className="underline font-medium">
                View {duplicate.name} on MCPpedia →
              </Link>
            </div>
          )}
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
              className="px-5 py-2.5 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0 font-medium"
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
                      <Icon name="check" size={10} />
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
                    <Icon name="check" size={10} />
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
          className="w-full px-4 py-3 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors text-base"
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
