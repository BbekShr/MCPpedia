'use client'

import { useState, useEffect, useCallback } from 'react'
import { COMPATIBLE_CLIENTS, CLIENT_LABELS, type CompatibleClient } from '@/lib/constants'

// install_configs is keyed by client; each value follows the standard MCP
// shape { mcpServers: { [<entryKey>]: { command, args, env? } } }. The entry
// key is usually the server slug, but extract-install-info.ts can produce
// other names — preserve whatever's there instead of forcing a rename.
type Entry = { command: string; args: string[]; env?: Record<string, string> }
type ConfigShape = { mcpServers?: Record<string, Entry> }

type ParsedClient = {
  entryKey: string
  command: string
  args: string[]
  env: Array<{ key: string; value: string }>
}

function parseValue(json: string): {
  parsed: Record<string, ParsedClient | null>
  unknown: Record<string, unknown>
  parseError: string | null
} {
  let raw: Record<string, unknown> = {}
  try {
    const v = JSON.parse(json || '{}')
    if (v && typeof v === 'object' && !Array.isArray(v)) raw = v as Record<string, unknown>
    else return { parsed: {}, unknown: {}, parseError: 'Top-level value is not an object' }
  } catch (e) {
    return { parsed: {}, unknown: {}, parseError: e instanceof Error ? e.message : 'Invalid JSON' }
  }

  const parsed: Record<string, ParsedClient | null> = {}
  const unknown: Record<string, unknown> = {}

  for (const [client, value] of Object.entries(raw)) {
    if (!COMPATIBLE_CLIENTS.includes(client as CompatibleClient)) {
      // Preserve clients we don't recognise so saving doesn't drop them.
      unknown[client] = value
      continue
    }
    const cfg = value as ConfigShape | undefined
    const entries = cfg?.mcpServers ? Object.entries(cfg.mcpServers) : []
    if (entries.length === 0) {
      parsed[client] = { entryKey: '', command: '', args: [], env: [] }
      continue
    }
    const [entryKey, entry] = entries[0]
    parsed[client] = {
      entryKey,
      command: entry?.command ?? '',
      args: Array.isArray(entry?.args) ? entry.args.map(String) : [],
      env: entry?.env
        ? Object.entries(entry.env).map(([k, v]) => ({ key: k, value: String(v) }))
        : [],
    }
  }
  return { parsed, unknown, parseError: null }
}

function serialize(
  parsed: Record<string, ParsedClient | null>,
  unknown: Record<string, unknown>,
  fallbackEntryKey: string,
): string {
  const out: Record<string, unknown> = { ...unknown }
  for (const [client, p] of Object.entries(parsed)) {
    if (!p) continue
    const entryKey = p.entryKey || fallbackEntryKey
    const entry: Entry = { command: p.command, args: p.args }
    const envObj: Record<string, string> = {}
    for (const { key, value } of p.env) {
      if (key) envObj[key] = value
    }
    if (Object.keys(envObj).length > 0) entry.env = envObj
    out[client] = { mcpServers: { [entryKey]: entry } }
  }
  return JSON.stringify(out, null, 2)
}

export default function InstallConfigEditor({
  value,
  onChange,
  serverSlug,
  disabled = false,
}: {
  value: string
  onChange: (json: string) => void
  serverSlug: string
  disabled?: boolean
}) {
  const [parsed, setParsed] = useState<Record<string, ParsedClient | null>>({})
  const [unknown, setUnknown] = useState<Record<string, unknown>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [active, setActive] = useState<CompatibleClient | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  // Hydrate from the incoming JSON string. We only re-hydrate when the value
  // changes externally (e.g. initial load), not on every internal edit.
  useEffect(() => {
    const result = parseValue(value)
    setParsed(result.parsed)
    setUnknown(result.unknown)
    setParseError(result.parseError)
    if (!active) {
      const first = Object.keys(result.parsed)[0] as CompatibleClient | undefined
      setActive(first ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = useCallback(
    (next: Record<string, ParsedClient | null>, nextUnknown: Record<string, unknown> = unknown) => {
      setParsed(next)
      setUnknown(nextUnknown)
      onChange(serialize(next, nextUnknown, serverSlug))
    },
    [onChange, serverSlug, unknown],
  )

  const availableToAdd = COMPATIBLE_CLIENTS.filter(c => !parsed[c])

  if (parseError && !showRaw) {
    return (
      <div className="border border-yellow rounded-md p-4 bg-yellow/5 text-sm">
        <p className="text-text-primary mb-2">
          Couldn&apos;t parse install_configs ({parseError}). Edit raw JSON instead.
        </p>
        <button
          type="button"
          onClick={() => setShowRaw(true)}
          className="text-xs px-3 py-1 rounded border border-border text-text-primary hover:border-accent"
        >
          Show raw JSON editor
        </button>
      </div>
    )
  }

  if (showRaw) {
    return (
      <div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={12}
          disabled={disabled}
          className="w-full px-3 py-2 text-xs font-mono border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent resize-y disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShowRaw(false)}
          className="mt-2 text-xs text-accent hover:text-accent-hover"
        >
          ← Back to structured editor
        </button>
      </div>
    )
  }

  const activeConfig = active ? parsed[active] : null

  return (
    <div className="border border-border rounded-md">
      {/* Client tabs */}
      <div className="flex flex-wrap items-center gap-1 px-2 pt-2 border-b border-border">
        {(Object.keys(parsed) as CompatibleClient[]).map(client => (
          <button
            key={client}
            type="button"
            onClick={() => setActive(client)}
            className={`px-3 py-1.5 text-xs rounded-t border-b-2 -mb-px ${
              active === client
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {CLIENT_LABELS[client]}
          </button>
        ))}
        {availableToAdd.length > 0 && !disabled && (
          <select
            value=""
            onChange={e => {
              const client = e.target.value as CompatibleClient
              if (!client) return
              const next = { ...parsed, [client]: { entryKey: serverSlug, command: '', args: [], env: [] } }
              commit(next)
              setActive(client)
            }}
            className="ml-auto text-xs px-2 py-1 border border-border rounded bg-bg text-text-primary"
          >
            <option value="">+ Add client…</option>
            {availableToAdd.map(c => (
              <option key={c} value={c}>{CLIENT_LABELS[c]}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setShowRaw(true)}
          className="text-xs text-text-muted hover:text-text-primary px-2 py-1"
          title="Edit raw JSON"
        >
          {'{ }'}
        </button>
      </div>

      {/* Active client editor */}
      {!active || !activeConfig ? (
        <div className="p-6 text-center text-sm text-text-muted">
          No clients configured. Add one above.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
              Entry key
            </label>
            <input
              type="text"
              value={activeConfig.entryKey}
              onChange={e => commit({ ...parsed, [active]: { ...activeConfig, entryKey: e.target.value } })}
              disabled={disabled}
              placeholder={serverSlug}
              className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-text-muted">
              The key under <code className="font-mono">mcpServers</code>. Defaults to the server slug.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
              Command
            </label>
            <input
              type="text"
              value={activeConfig.command}
              onChange={e => commit({ ...parsed, [active]: { ...activeConfig, command: e.target.value } })}
              disabled={disabled}
              placeholder="npx"
              className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
              Args
            </label>
            <div className="space-y-1.5">
              {activeConfig.args.map((arg, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={arg}
                    onChange={e => {
                      const args = [...activeConfig.args]
                      args[i] = e.target.value
                      commit({ ...parsed, [active]: { ...activeConfig, args } })
                    }}
                    disabled={disabled}
                    className="flex-1 px-3 py-1.5 text-sm font-mono border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const args = activeConfig.args.filter((_, j) => j !== i)
                      commit({ ...parsed, [active]: { ...activeConfig, args } })
                    }}
                    disabled={disabled}
                    className="px-2 py-1 text-xs text-text-muted hover:text-red border border-border rounded disabled:opacity-50"
                    aria-label="Remove arg"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => commit({ ...parsed, [active]: { ...activeConfig, args: [...activeConfig.args, ''] } })}
                disabled={disabled}
                className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
              >
                + Add arg
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
              Environment variables
            </label>
            <div className="space-y-1.5">
              {activeConfig.env.map((pair, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={pair.key}
                    onChange={e => {
                      const env = [...activeConfig.env]
                      env[i] = { ...env[i], key: e.target.value }
                      commit({ ...parsed, [active]: { ...activeConfig, env } })
                    }}
                    disabled={disabled}
                    placeholder="API_KEY"
                    className="flex-1 px-3 py-1.5 text-sm font-mono border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={pair.value}
                    onChange={e => {
                      const env = [...activeConfig.env]
                      env[i] = { ...env[i], value: e.target.value }
                      commit({ ...parsed, [active]: { ...activeConfig, env } })
                    }}
                    disabled={disabled}
                    placeholder="<your-api-key>"
                    className="flex-[2] px-3 py-1.5 text-sm font-mono border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const env = activeConfig.env.filter((_, j) => j !== i)
                      commit({ ...parsed, [active]: { ...activeConfig, env } })
                    }}
                    disabled={disabled}
                    className="px-2 py-1 text-xs text-text-muted hover:text-red border border-border rounded disabled:opacity-50"
                    aria-label="Remove env var"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => commit({ ...parsed, [active]: { ...activeConfig, env: [...activeConfig.env, { key: '', value: '' }] } })}
                disabled={disabled}
                className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
              >
                + Add env var
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => {
                const next = { ...parsed }
                delete next[active]
                commit(next)
                setActive((Object.keys(next)[0] as CompatibleClient) ?? null)
              }}
              disabled={disabled}
              className="text-xs text-red hover:underline disabled:opacity-50"
            >
              Remove {CLIENT_LABELS[active]} config
            </button>
          </div>
        </div>
      )}

      {Object.keys(unknown).length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-yellow/5 text-xs text-text-muted">
          {Object.keys(unknown).length} unrecognised client config{Object.keys(unknown).length === 1 ? '' : 's'} will be preserved on save: {Object.keys(unknown).join(', ')}
        </div>
      )}
    </div>
  )
}
