'use client'

import { useMemo, useState } from 'react'
import { CLIENT_LABELS, type CompatibleClient } from '@/lib/constants'
import type { Server } from '@/lib/types'
import { Icon } from './helpers'

type ClientKey = CompatibleClient

const CLIENT_META: Record<ClientKey, { letter: string; color: string; path: string; shortLabel?: string }> = {
  'claude-desktop': {
    letter: 'CD',
    color: 'oklch(0.62 0.15 35)',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
    shortLabel: 'Desktop',
  },
  'cursor': {
    letter: 'Cu',
    color: 'oklch(0.2 0 0)',
    path: '~/.cursor/mcp.json',
  },
  'claude-code': {
    letter: 'CC',
    color: 'oklch(0.62 0.15 35)',
    path: 'claude mcp add — one-liner below',
    shortLabel: 'Code',
  },
  'windsurf': {
    letter: 'Wd',
    color: 'oklch(0.65 0.13 180)',
    path: '~/.codeium/windsurf/mcp_config.json',
  },
  'other': {
    letter: '··',
    color: 'var(--text-muted)',
    path: 'See your client docs',
  },
}

function ClientGlyph({ client, size = 20 }: { client: ClientKey; size?: number }) {
  const meta = CLIENT_META[client]
  return (
    <div
      className="font-mono font-bold flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        color: meta.color,
        fontSize: size >= 30 ? 11.5 : 10.5,
        border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
      }}
    >
      {meta.letter}
    </div>
  )
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

function cliCommand(slug: string, command: string, args: string[], env?: Record<string, string>): string {
  const envParts = env
    ? Object.entries(env)
        .map(([k, v]) => `-e ${shellQuote(k)}=${shellQuote(v)}`)
        .join(' ') + ' '
    : ''
  const quoted = args.map(shellQuote).join(' ')
  return `claude mcp add ${shellQuote(slug)} ${envParts}-- ${shellQuote(command)} ${quoted}`
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function generateConfig(
  client: ClientKey,
  server: Pick<Server, 'name' | 'npm_package' | 'pip_package' | 'requires_api_key' | 'install_configs'>,
): { config: Record<string, unknown> | string; isCli: boolean } {
  const stored = server.install_configs?.[client] as Record<string, unknown> | undefined
  const hasReal = stored && Object.keys(stored).length > 0
  const slug = slugify(server.name)

  // claude-code: convert stored JSON → CLI one-liner, or synthesise one
  if (client === 'claude-code') {
    if (hasReal) {
      const root = stored as { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> }
      const entry = root.mcpServers ? Object.values(root.mcpServers)[0] : null
      if (entry?.command && entry.args) {
        return { config: cliCommand(slug, entry.command, entry.args, entry.env), isCli: true }
      }
    }
    if (server.npm_package) {
      const env = server.requires_api_key ? { API_KEY: '<your-api-key>' } : undefined
      return { config: cliCommand(slug, 'npx', ['-y', server.npm_package], env), isCli: true }
    }
    if (server.pip_package) {
      const env = server.requires_api_key ? { API_KEY: '<your-api-key>' } : undefined
      return { config: cliCommand(slug, 'uvx', [server.pip_package], env), isCli: true }
    }
    return { config: `# See README for setup\nclaude mcp add ${slug} -- <command> <args>`, isCli: true }
  }

  if (hasReal) return { config: stored as Record<string, unknown>, isCli: false }

  // Auto-generate JSON from package info
  if (server.npm_package) {
    const base: Record<string, unknown> = { command: 'npx', args: ['-y', server.npm_package] }
    if (server.requires_api_key) base.env = { API_KEY: '<your-api-key>' }
    return { config: { mcpServers: { [slug]: base } }, isCli: false }
  }
  if (server.pip_package) {
    const base: Record<string, unknown> = { command: 'uvx', args: [server.pip_package] }
    if (server.requires_api_key) base.env = { API_KEY: '<your-api-key>' }
    return { config: { mcpServers: { [slug]: base } }, isCli: false }
  }
  return {
    config: { mcpServers: { [slug]: { command: '<see-readme>', args: [] } } },
    isCli: false,
  }
}

export default function InstallMatrix({ server }: { server: Server }) {
  // Build the ordered client list: compatible_clients first, then any client
  // with a stored install_config that isn't already in the list.
  const clients = useMemo<ClientKey[]>(() => {
    const compatible = (server.compatible_clients ?? []).filter(
      (c): c is ClientKey => c in CLIENT_META,
    )
    const fromConfigs = Object.keys(server.install_configs ?? {}).filter(
      (c): c is ClientKey => c in CLIENT_META && !compatible.includes(c as ClientKey),
    )
    const merged = [...compatible, ...fromConfigs]
    return merged.length ? merged : (['claude-desktop', 'cursor', 'claude-code'] as ClientKey[])
  }, [server.compatible_clients, server.install_configs])

  const [active, setActive] = useState<ClientKey>(clients[0])
  const [copied, setCopied] = useState(false)

  const { config, isCli } = useMemo(() => generateConfig(active, server), [active, server])
  const configStr = isCli ? (config as string) : JSON.stringify(config, null, 2)

  function copy() {
    navigator.clipboard?.writeText(configStr).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const activeMeta = CLIENT_META[active]
  const isSupported = (server.compatible_clients ?? []).includes(active)
  const transportLine =
    (server.transport?.join(', ') || 'stdio') +
    (active === 'claude-desktop' ? ' · Node 18+' : '') +
    (server.requires_api_key ? ' · API key required' : '')

  return (
    <div
      className="rounded-[10px] overflow-hidden bg-bg"
      style={{ border: '1px solid var(--border)' }}
    >
      {/* Tabs */}
      <div
        role="tablist"
        className="grid border-b border-border bg-bg-secondary"
        style={{ gridTemplateColumns: `repeat(${clients.length}, minmax(0, 1fr))` }}
      >
        {clients.map((c, i) => {
          const meta = CLIENT_META[c]
          const label = meta.shortLabel ?? CLIENT_LABELS[c]
          const isActive = c === active
          const last = i === clients.length - 1
          return (
            <button
              key={c}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(c)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-1 text-xs min-w-0 relative"
              style={{
                border: 'none',
                borderRight: last ? 'none' : '1px solid var(--border)',
                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                background: isActive ? 'var(--bg)' : 'transparent',
                color: 'var(--text)',
                fontWeight: isActive ? 600 : 500,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <ClientGlyph client={c} size={20} />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="p-4">
        {/* Status strip */}
        <div
          className="flex items-center gap-2.5 flex-wrap px-3 py-2 mb-3 rounded-lg text-[12.5px]"
          style={{
            background: isSupported
              ? 'color-mix(in srgb, var(--green) 7%, transparent)'
              : 'color-mix(in srgb, var(--yellow) 9%, transparent)',
            border: `1px solid ${
              isSupported
                ? 'color-mix(in srgb, var(--green) 22%, transparent)'
                : 'color-mix(in srgb, var(--yellow) 28%, transparent)'
            }`,
          }}
        >
          <ClientGlyph client={active} size={28} />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-semibold text-text-primary">
              {isSupported ? `Supported in ${CLIENT_LABELS[active]}` : `Untested on ${CLIENT_LABELS[active]}`}
            </span>
            <span className="text-text-muted">{transportLine}</span>
          </div>
        </div>

        {/* Path + copy */}
        <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted min-w-0 flex-1">
            Paste into{' '}
            <span className="text-text-primary break-all normal-case tracking-normal">
              {activeMeta.path}
            </span>
          </div>
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md shrink-0"
            style={{
              background: copied ? 'var(--green)' : 'var(--bg-tertiary)',
              color: copied ? '#fff' : 'var(--text)',
              border: `1px solid ${copied ? 'var(--green)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} />
            {copied ? 'Copied' : isCli ? 'Copy command' : 'Copy JSON'}
          </button>
        </div>

        <pre
          className="m-0 font-mono text-[12.5px] leading-[1.55] rounded-md p-3 overflow-auto"
          style={{
            background: 'var(--code-bg)',
            border: '1px solid var(--border)',
          }}
        >
          <code>{configStr}</code>
        </pre>

        {server.requires_api_key && (
          <div
            className="mt-3 px-2.5 py-2 rounded-md text-xs text-text-primary flex gap-2 items-start"
            style={{
              background: 'color-mix(in srgb, var(--yellow) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--yellow) 30%, transparent)',
            }}
          >
            <span className="mt-0.5" style={{ color: 'var(--yellow)' }}>
              <Icon name="alert" size={13} />
            </span>
            <span>
              Requires an API key. Replace <code className="font-mono">&lt;your-api-key&gt;</code> with your actual key.{' '}
              <a href="#api-keys" className="text-accent hover:text-accent-hover">
                How to get one →
              </a>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
