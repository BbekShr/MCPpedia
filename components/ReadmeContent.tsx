'use client'

import { useState, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'

export default function ReadmeContent({ githubUrl }: { githubUrl: string }) {
  const [readme, setReadme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const match = githubUrl.match(/github\.com\/([\w.-]+)\/([\w.-]+)/)
    if (!match) { setLoading(false); return }

    const [, owner, repo] = match

    fetch(`https://api.github.com/repos/${owner}/${repo.replace(/\.git$/, '')}/readme`, {
      headers: { Accept: 'application/vnd.github.html+json' },
    })
      .then(res => res.ok ? res.text() : null)
      .then(html => {
        setReadme(html)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [githubUrl])

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-bg-tertiary rounded w-3/4" />
        <div className="h-3 bg-bg-tertiary rounded w-full" />
        <div className="h-3 bg-bg-tertiary rounded w-5/6" />
        <div className="h-3 bg-bg-tertiary rounded w-full" />
        <div className="h-3 bg-bg-tertiary rounded w-2/3" />
      </div>
    )
  }

  if (!readme) return null

  const isLong = readme.length > 3000

  return (
    <div>
      <div
        className={`readme-content prose prose-sm max-w-none text-text-primary prose-headings:text-text-primary prose-a:text-accent prose-code:text-text-primary prose-code:bg-code-bg prose-code:px-1 prose-code:rounded prose-pre:bg-code-bg prose-pre:border prose-pre:border-border prose-img:rounded-md prose-img:border prose-img:border-border ${
          !expanded && isLong ? 'max-h-[600px] overflow-hidden relative' : ''
        }`}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(readme) }}
      />
      {isLong && !expanded && (
        <div className="relative -mt-20 pt-20 bg-gradient-to-t from-bg to-transparent">
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-3 text-sm text-accent hover:text-accent-hover font-medium"
          >
            Read full README
          </button>
        </div>
      )}
      {isLong && expanded && (
        <button
          onClick={() => { setExpanded(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          className="mt-4 text-sm text-text-muted hover:text-text-primary"
        >
          Collapse
        </button>
      )}
    </div>
  )
}
