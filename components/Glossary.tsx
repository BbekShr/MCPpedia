'use client'

import { useState } from 'react'

const TERMS: Record<string, string> = {
  'MCP': 'Model Context Protocol — a standard that lets AI assistants use external tools',
  'stdio': 'Standard I/O — the server runs on your computer and communicates via input/output streams. Most common and easiest to set up.',
  'SSE': 'Server-Sent Events — the server runs remotely and streams data over HTTP. Used for cloud-hosted servers.',
  'HTTP': 'The server communicates over web requests. Can be hosted remotely.',
  'transport': 'How the AI app talks to the server — either locally (stdio) or over the internet (HTTP/SSE).',
  'tool': 'A specific action the server can perform — like "search messages" or "create file".',
  'resource': 'Data the server can provide to the AI — like file contents or database records.',
  'prompt': 'A pre-written template that helps the AI use the server\'s features effectively.',
  'input schema': 'The parameters a tool accepts — like a function\'s arguments.',
  'context window': 'The AI\'s working memory. Every tool definition takes up space. Servers with many tools use more of this limited space.',
  'CVE': 'Common Vulnerabilities and Exposures — a publicly known security vulnerability with a unique ID.',
  'RLS': 'Row Level Security — database rules that control who can read/write which rows.',
  'API key': 'A password-like string that authenticates you with an external service (like Slack or GitHub).',
  'npm': 'Node Package Manager — where JavaScript/TypeScript packages are published. Most MCP servers are installed via npm.',
  'PyPI': 'Python Package Index — where Python packages are published. Some MCP servers are Python-based.',
}

export function GlossaryTerm({ term, children }: { term: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const definition = TERMS[term]

  if (!definition) return <>{children}</>

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="border-b border-dotted border-text-muted cursor-help">
        {children}
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-md bg-text-primary text-bg text-xs max-w-xs w-max z-50 shadow-lg">
          {definition}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-text-primary" />
        </span>
      )}
    </span>
  )
}

export default function GlossaryPage() {
  return (
    <div className="space-y-3">
      {Object.entries(TERMS).sort(([a], [b]) => a.localeCompare(b)).map(([term, def]) => (
        <div key={term} className="flex gap-4 text-sm">
          <dt className="font-mono font-medium text-text-primary w-32 shrink-0">{term}</dt>
          <dd className="text-text-muted">{def}</dd>
        </div>
      ))}
    </div>
  )
}
