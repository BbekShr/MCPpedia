'use client'

import { useState } from 'react'
import { SITE_URL } from '@/lib/constants'

interface PopularServer {
  slug: string
  name: string
  score: number
}

export default function BadgePreview({ popularServers }: { popularServers: PopularServer[] }) {
  const [slug, setSlug] = useState('')
  const [activeSlug, setActiveSlug] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const currentSlug = activeSlug || 'your-slug'

  const markdownSnippet = `[![MCPpedia Score](${SITE_URL}/api/badge/${currentSlug})](${SITE_URL}/s/${currentSlug})`
  const htmlSnippet = `<a href="${SITE_URL}/s/${currentSlug}"><img src="${SITE_URL}/api/badge/${currentSlug}" alt="MCPpedia Score" /></a>`
  const detailedSnippet = `<a href="${SITE_URL}/s/${currentSlug}"><img src="${SITE_URL}/api/widget/${currentSlug}?style=detailed" alt="MCPpedia Score" /></a>`

  function selectServer(s: string) {
    setSlug(s)
    setActiveSlug(s)
  }

  function handleInput(val: string) {
    setSlug(val)
    // Auto-activate on reasonable slug input
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (cleaned.length >= 2) {
      setActiveSlug(cleaned)
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  return (
    <div>
      {/* Server input */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={slug}
            onChange={e => handleInput(e.target.value)}
            placeholder="Enter server slug (e.g. supabase)"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-bg-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>

        {/* Quick picks */}
        {popularServers.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-text-muted py-1">Popular:</span>
            {popularServers.map(s => (
              <button
                key={s.slug}
                onClick={() => selectServer(s.slug)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeSlug === s.slug
                    ? 'bg-accent text-white border-accent'
                    : 'border-border text-text-muted hover:border-accent hover:text-accent'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Live preview */}
      {activeSlug && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-bg-secondary px-4 py-2.5 border-b border-border">
            <span className="text-xs font-medium text-text-muted">Live preview for</span>
            <span className="text-xs font-mono text-accent ml-1.5">{activeSlug}</span>
          </div>

          <div className="p-4 space-y-4">
            {/* Flat badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-16 shrink-0">Flat</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/badge/${activeSlug}`}
                  alt={`MCPpedia score for ${activeSlug}`}
                  height={20}
                />
              </div>
              <button
                onClick={() => copyToClipboard(markdownSnippet, 'markdown')}
                className="text-xs px-3 py-1.5 rounded border border-border hover:border-accent hover:text-accent transition-colors text-text-muted"
              >
                {copied === 'markdown' ? (
                  <span className="text-green">Copied!</span>
                ) : (
                  'Copy Markdown'
                )}
              </button>
            </div>

            {/* Security badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-16 shrink-0">Security</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/badge/${activeSlug}?type=security`}
                  alt={`Security grade for ${activeSlug}`}
                  height={20}
                />
              </div>
              <button
                onClick={() => copyToClipboard(htmlSnippet, 'html')}
                className="text-xs px-3 py-1.5 rounded border border-border hover:border-accent hover:text-accent transition-colors text-text-muted"
              >
                {copied === 'html' ? (
                  <span className="text-green">Copied!</span>
                ) : (
                  'Copy HTML'
                )}
              </button>
            </div>

            {/* Detailed card */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-16 shrink-0">Detailed</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/widget/${activeSlug}?style=detailed`}
                  alt={`Detailed badge for ${activeSlug}`}
                  height={60}
                />
              </div>
              <button
                onClick={() => copyToClipboard(detailedSnippet, 'detailed')}
                className="text-xs px-3 py-1.5 rounded border border-border hover:border-accent hover:text-accent transition-colors text-text-muted"
              >
                {copied === 'detailed' ? (
                  <span className="text-green">Copied!</span>
                ) : (
                  'Copy HTML'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {!activeSlug && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-sm text-text-muted">
            Enter a server slug or click a popular server above to preview badges
          </p>
        </div>
      )}
    </div>
  )
}
