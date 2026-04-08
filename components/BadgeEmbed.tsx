'use client'

import { useState } from 'react'

interface BadgeEmbedProps {
  slug: string
}

export default function BadgeEmbed({ slug }: BadgeEmbedProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'score' | 'security'>('score')

  const siteUrl = 'https://mcppedia.org'
  const scoreMarkdown = `[![MCPpedia Score](${siteUrl}/api/badge/${slug})](${siteUrl}/s/${slug})`
  const securityMarkdown = `[![MCPpedia Security](${siteUrl}/api/badge/${slug}?type=security)](${siteUrl}/s/${slug})`

  const markdown = activeTab === 'score' ? scoreMarkdown : securityMarkdown

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="border border-border rounded-md p-3 bg-bg-secondary">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-primary">Embed in your README</span>
        <a
          href={`/badge`}
          className="text-xs text-accent hover:text-accent-hover"
        >
          About badges &rarr;
        </a>
      </div>

      {/* Badge type tabs */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setActiveTab('score')}
          className={`px-2 py-0.5 text-xs rounded transition-colors ${activeTab === 'score' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary border border-border'}`}
        >
          Overall score
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-2 py-0.5 text-xs rounded transition-colors ${activeTab === 'security' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary border border-border'}`}
        >
          Security grade
        </button>
      </div>

      {/* Live preview */}
      <div className="mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/badge/${slug}${activeTab === 'security' ? '?type=security' : ''}`}
          alt={activeTab === 'security' ? 'MCPpedia Security badge' : 'MCPpedia Score badge'}
          height={20}
          className="h-5"
        />
      </div>

      {/* Markdown snippet with copy */}
      <div className="relative group">
        <div className="bg-code-bg border border-border rounded p-2 font-mono text-xs text-text-muted break-all pr-16">
          {markdown}
        </div>
        <button
          onClick={() => copy(markdown, 'md')}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs rounded border border-border bg-bg text-text-muted hover:text-text-primary transition-colors"
        >
          {copied === 'md' ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
