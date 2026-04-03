'use client'

import { useState } from 'react'
import type { Tool } from '@/lib/types'

export default function ToolsList({ tools }: { tools: Tool[] }) {
  const [filter, setFilter] = useState('')
  const [showAll, setShowAll] = useState(false)

  const filtered = filter
    ? tools.filter(t =>
        t.name.toLowerCase().includes(filter.toLowerCase()) ||
        t.description?.toLowerCase().includes(filter.toLowerCase())
      )
    : tools

  const visible = showAll ? filtered : filtered.slice(0, 10)
  const remaining = filtered.length - visible.length

  return (
    <div>
      {/* Search */}
      {tools.length > 5 && (
        <div className="mb-3">
          <input
            type="text"
            value={filter}
            onChange={e => { setFilter(e.target.value); setShowAll(true) }}
            placeholder={`Filter ${tools.length} tools...`}
            aria-label={`Filter ${tools.length} tools`}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5" role="list" aria-label="MCP tools">
        {visible.map(tool => (
          <div
            key={tool.name}
            className="py-2 border-b border-border/50 group"
          >
            <code className="text-xs font-mono font-medium text-text-primary">{tool.name}</code>
            {tool.description && (
              <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{tool.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* Show more / less */}
      {remaining > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm text-accent hover:text-accent-hover"
        >
          Show all {filtered.length} tools
        </button>
      )}
      {showAll && filtered.length > 10 && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-3 text-sm text-text-muted hover:text-text-primary"
        >
          Show less
        </button>
      )}

      {filter && filtered.length === 0 && (
        <p className="text-sm text-text-muted py-3">No tools matching &ldquo;{filter}&rdquo;</p>
      )}
    </div>
  )
}
