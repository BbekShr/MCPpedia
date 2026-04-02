'use client'

import { useState } from 'react'
import { CLIENT_LABELS, type CompatibleClient } from '@/lib/constants'

interface Props {
  configs: Record<string, unknown>
  compatibleClients: string[]
  serverName: string
}

export default function InstallConfig({ configs, compatibleClients, serverName }: Props) {
  const clients = compatibleClients.length > 0
    ? compatibleClients
    : Object.keys(configs).length > 0
      ? Object.keys(configs)
      : ['claude-desktop']

  const [activeClient, setActiveClient] = useState(clients[0])
  const [copied, setCopied] = useState(false)

  const config = configs[activeClient] || configs[clients[0]] || {
    mcpServers: {
      [serverName.toLowerCase().replace(/\s+/g, '-')]: {
        command: 'npx',
        args: ['-y', `@example/${serverName.toLowerCase().replace(/\s+/g, '-')}`],
      },
    },
  }

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
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-2 py-1 text-xs rounded border border-border bg-bg hover:bg-bg-tertiary text-text-muted transition-colors duration-150"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
