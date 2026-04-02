'use client'

import { useState } from 'react'
import type { Tool } from '@/lib/types'
import ToolCard from './ToolCard'

export default function ToolsExpanderClient({ tools }: { tools: Tool[] }) {
  const [showAll, setShowAll] = useState(false)

  if (!showAll) {
    return (
      <button
        onClick={() => setShowAll(true)}
        className="mt-3 text-sm text-accent hover:text-accent-hover"
      >
        Show all {tools.length} tools
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      {tools.slice(10).map(tool => (
        <ToolCard key={tool.name} tool={tool} />
      ))}
    </div>
  )
}
