'use client'

import { useState, useCallback } from 'react'
import { Icon } from '@/components/ui/icons'

interface Props {
  configs: Record<string, unknown>
  serverName: string
}

export default function CopyConfigButton({ configs, serverName }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Try to find the best config: claude-desktop > cursor > first available
    let config: unknown = null
    if (configs) {
      config = configs['claude-desktop'] || configs['cursor'] || Object.values(configs)[0]
    }

    if (!config) return

    const text = JSON.stringify(config, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: noop
    }
  }, [configs])

  if (!configs || Object.keys(configs).length === 0) return null

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all shrink-0"
      title={`Copy install config for ${serverName}`}
      aria-label={copied ? 'Config copied!' : `Copy install config for ${serverName}`}
    >
      {copied ? (
        <>
          <Icon name="check" size={11} />
          Copied!
        </>
      ) : (
        <>
          <Icon name="copy" size={11} />
          Config
        </>
      )}
    </button>
  )
}
