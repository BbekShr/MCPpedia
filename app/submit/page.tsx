'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, CATEGORY_LABELS, TRANSPORTS, API_PRICING_OPTIONS } from '@/lib/constants'
import type { Category } from '@/lib/constants'
import type { User } from '@supabase/supabase-js'
import { useEffect } from 'react'

function SubmitForm() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

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
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Add a server to MCPpedia</h1>
        <p className="text-text-muted mb-6">Sign in with GitHub to submit a server.</p>
        <a
          href={`/login?redirect=/submit`}
          className="inline-block px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Sign in with GitHub
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Server submitted!</h1>
        <p className="text-text-muted">Redirecting to the server page...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">Add a server to MCPpedia</h1>
      <p className="text-text-muted mb-8 text-sm">Paste a GitHub URL and we&apos;ll do the rest.</p>

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red bg-red/5 text-sm text-red">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* GitHub URL */}
        <div className="p-4 border border-border rounded-md bg-bg-secondary space-y-3">
          <label className="block text-sm font-medium text-text-primary">GitHub URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              required
              className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={fetching || !githubUrl}
              className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0"
            >
              {fetching ? 'Fetching...' : 'Auto-fill'}
            </button>
          </div>
        </div>

        {/* Basic info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Tagline</label>
            <input
              type="text"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="One-line description"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Author</label>
              <input
                type="text"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">License</label>
              <input
                type="text"
                value={license}
                onChange={e => setLicense(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
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
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">pip package</label>
              <input
                type="text"
                value={pipPackage}
                onChange={e => setPipPackage(e.target.value)}
                placeholder="mcp-server-name"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        {/* Transport */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Transport</label>
          <div className="flex gap-4">
            {TRANSPORTS.map(t => (
              <label key={t} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={transport.includes(t)}
                  onChange={() => toggleTransport(t)}
                  className="rounded border-border"
                />
                {t.toUpperCase()}
              </label>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Categories</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <label key={c} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={categories.includes(c)}
                  onChange={() => toggleCategory(c)}
                  className="rounded border-border"
                />
                {CATEGORY_LABELS[c as Category]}
              </label>
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
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
            >
              {API_PRICING_OPTIONS.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={requiresApiKey}
                onChange={e => setRequiresApiKey(e.target.checked)}
                className="rounded border-border"
              />
              Requires API key
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !name}
          className="w-full px-4 py-2.5 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting...' : 'Submit server'}
        </button>
      </form>
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
