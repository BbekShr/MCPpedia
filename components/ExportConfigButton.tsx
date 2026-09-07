'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icons'

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
      <Icon name="download" size={16} />
      {copied ? `Copied ${count} server configs!` : `Export all ${count} configs`}
    </button>
  )
}
