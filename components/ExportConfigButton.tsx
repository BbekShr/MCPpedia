'use client'

import { useState } from 'react'

interface Props {
  config: Record<string, unknown>
  count: number
}

export default function ExportConfigButton({ config, count }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleExport() {
    const fullConfig = {
      mcpServers: config,
    }
    const json = JSON.stringify(fullConfig, null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Fallback: open as downloadable blob
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'claude_desktop_config.json'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-accent text-accent hover:bg-accent hover:text-white transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      {copied ? `Copied ${count} server configs!` : `Export all ${count} configs`}
    </button>
  )
}
