'use client'

import { useState, useCallback } from 'react'

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
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Config
        </>
      )}
    </button>
  )
}
