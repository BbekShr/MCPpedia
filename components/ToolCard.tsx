'use client'

import { useState } from 'react'
import type { Tool } from '@/lib/types'

interface ParameterSchema {
  type?: string
  description?: string
  properties?: Record<string, ParameterSchema>
  required?: string[]
  default?: unknown
}

function renderParams(schema: ParameterSchema | undefined) {
  if (!schema?.properties) return null

  const required = new Set(schema.required || [])

  return (
    <div className="mt-2 space-y-1">
      <div className="text-xs font-medium text-text-muted">Parameters:</div>
      {Object.entries(schema.properties).map(([name, prop]) => (
        <div key={name} className="text-xs text-text-muted pl-3">
          <code className="font-mono text-text-primary">{name}</code>
          {' '}
          <span className="text-text-muted">
            ({prop.type || 'any'}{required.has(name) ? ', required' : ', optional'}
            {prop.default !== undefined ? `, default: ${JSON.stringify(prop.default)}` : ''})
          </span>
          {prop.description && (
            <span className="block pl-3 text-text-muted">{prop.description}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function ToolCard({ tool }: { tool: Tool }) {
  const [expanded, setExpanded] = useState(false)
  const hasParams = tool.input_schema && Object.keys(tool.input_schema).length > 0

  return (
    <div className="border border-border rounded-md p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-start justify-between gap-2"
      >
        <div>
          <code className="text-sm font-mono font-medium text-text-primary">{tool.name}</code>
          {tool.description && (
            <p className="text-sm text-text-muted mt-0.5">{tool.description}</p>
          )}
        </div>
        {hasParams && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`shrink-0 mt-1 text-text-muted transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {expanded && hasParams && renderParams(tool.input_schema as ParameterSchema)}
    </div>
  )
}
