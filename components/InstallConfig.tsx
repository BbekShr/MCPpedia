'use client'

import { useState } from 'react'
import { CLIENT_LABELS, type CompatibleClient } from '@/lib/constants'

interface Props {
  configs: Record<string, unknown>
  compatibleClients: string[]
  serverName: string
  npmPackage?: string | null
  pipPackage?: string | null
  requiresApiKey?: boolean
  slug?: string
}

function generateConfig(
  client: string,
  serverName: string,
  npmPackage?: string | null,
  pipPackage?: string | null,
  requiresApiKey?: boolean
): Record<string, unknown> {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  if (npmPackage) {
    const base: Record<string, unknown> = {
      command: 'npx',
      args: ['-y', npmPackage],
    }
    if (requiresApiKey) {
      base.env = { API_KEY: '<your-api-key>' }
    }

    if (client === 'claude-code') {
      return { mcpServers: { [slug]: base } }
    }
    return { mcpServers: { [slug]: base } }
  }

  if (pipPackage) {
    const base: Record<string, unknown> = {
      command: 'uvx',
      args: [pipPackage],
    }
    if (requiresApiKey) {
      base.env = { API_KEY: '<your-api-key>' }
    }
    return { mcpServers: { [slug]: base } }
  }

  // No package info — show a helpful message
  return {
    mcpServers: {
      [slug]: {
        command: '<see-readme>',
        args: [],
      },
    },
  }
}

export default function InstallConfig({ configs, compatibleClients, serverName, npmPackage, pipPackage, requiresApiKey }: Props) {
  const clients = compatibleClients.length > 0
    ? compatibleClients
    : Object.keys(configs).length > 0
      ? Object.keys(configs)
      : ['claude-desktop', 'cursor', 'claude-code']

  const [activeClient, setActiveClient] = useState(clients[0])
  const [copied, setCopied] = useState(false)

  // Use provided config if it exists, otherwise auto-generate from package info
  const hasRealConfig = configs[activeClient] && Object.keys(configs[activeClient] as object).length > 0
  const config = hasRealConfig
    ? configs[activeClient]
    : generateConfig(activeClient, serverName, npmPackage, pipPackage, requiresApiKey)

  const configStr = JSON.stringify(config, null, 2)

  async function handleCopy() {
    await navigator.clipboard.writeText(configStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Client tabs */}
      <div className="flex gap-1 mb-3">
        {clients.map(client => (
          <button
            key={client}
            onClick={() => setActiveClient(client)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors duration-150 ${
              activeClient === client
                ? 'bg-bg-tertiary text-text-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {CLIENT_LABELS[client as CompatibleClient] || client}
          </button>
        ))}
      </div>

      {/* Config block */}
      <div className="relative">
        <pre className="bg-code-bg border border-border rounded-md p-4 overflow-x-auto text-sm font-mono">
          <code>{configStr}</code>
        </pre>
        <div className="absolute top-2 right-2 flex gap-1.5">
          <a
            href="/setup"
            className="px-2 py-1 text-xs rounded border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Setup guide
          </a>
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs rounded border border-border bg-bg hover:bg-bg-tertiary text-text-muted transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Help text */}
      {!hasRealConfig && npmPackage && (
        <p className="text-xs text-text-muted mt-2">
          Auto-generated from package name. Add to your client&apos;s MCP config file.
          {requiresApiKey && <span className="text-yellow"> Replace <code>&lt;your-api-key&gt;</code> with your actual key.</span>}
        </p>
      )}
      {!hasRealConfig && !npmPackage && !pipPackage && (
        <p className="text-xs text-text-muted mt-2">
          No install config available. Check the server&apos;s README for setup instructions.
        </p>
      )}
    </div>
  )
}
