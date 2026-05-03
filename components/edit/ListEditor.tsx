'use client'

import { useState, useEffect, useCallback } from 'react'

// Generic editor for arrays of objects with a known field shape. Used for
// `tools` ({name, description, input_schema?}) and `resources`
// ({name, description, uri_template?}). Unknown extra keys on each item are
// preserved on save so we don't drop bot-extracted fields.
type FieldSpec = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'json'
  placeholder?: string
  rows?: number
}

type Item = Record<string, unknown>

function parseValue(json: string): { items: Item[]; parseError: string | null } {
  try {
    const v = JSON.parse(json || '[]')
    if (!Array.isArray(v)) return { items: [], parseError: 'Top-level value is not an array' }
    return { items: v as Item[], parseError: null }
  } catch (e) {
    return { items: [], parseError: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

function serialize(items: Item[]): string {
  return JSON.stringify(items, null, 2)
}

export default function ListEditor({
  value,
  onChange,
  fields,
  itemLabel,
  emptyTemplate,
  disabled = false,
}: {
  value: string
  onChange: (json: string) => void
  fields: FieldSpec[]
  itemLabel: string
  emptyTemplate: Item
  disabled?: boolean
}) {
  const [items, setItems] = useState<Item[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    const result = parseValue(value)
    setItems(result.items)
    setParseError(result.parseError)
  }, [value])

  const commit = useCallback(
    (next: Item[]) => {
      setItems(next)
      onChange(serialize(next))
    },
    [onChange],
  )

  if (parseError && !showRaw) {
    return (
      <div className="border border-yellow rounded-md p-4 bg-yellow/5 text-sm">
        <p className="text-text-primary mb-2">
          Couldn&apos;t parse list ({parseError}). Edit raw JSON instead.
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

  const updateField = (idx: number, key: string, raw: string, type: FieldSpec['type']) => {
    const next = [...items]
    if (type === 'json') {
      // Keep raw JSON as a string until it parses, so the user can type
      // freely. We round-trip through JSON.parse only if the text is valid.
      try {
        const parsed = raw.trim() === '' ? undefined : JSON.parse(raw)
        const item = { ...next[idx], [key]: parsed }
        if (parsed === undefined) delete (item as Record<string, unknown>)[key]
        next[idx] = item
        commit(next)
      } catch {
        // Don't commit while invalid; just store the raw string locally.
        next[idx] = { ...next[idx], [`__raw_${key}`]: raw }
        setItems(next)
      }
    } else {
      const item = { ...next[idx], [key]: raw }
      if (raw === '') delete (item as Record<string, unknown>)[key]
      next[idx] = item
      commit(next)
    }
  }

  return (
    <div className="border border-border rounded-md">
      <div className="flex items-center justify-end px-2 pt-2">
        <button
          type="button"
          onClick={() => setShowRaw(true)}
          className="text-xs text-text-muted hover:text-text-primary px-2 py-1"
          title="Edit raw JSON"
        >
          {'{ }'}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">
          No {itemLabel}s yet.
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {items.map((item, idx) => (
            <li key={idx} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-text-muted">#{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => commit(items.filter((_, j) => j !== idx))}
                  disabled={disabled}
                  className="text-xs text-text-muted hover:text-red disabled:opacity-50"
                  aria-label={`Remove ${itemLabel} ${idx + 1}`}
                >
                  Remove
                </button>
              </div>
              {fields.map(f => {
                const raw = item[`__raw_${f.key}`] as string | undefined
                const stored = item[f.key]
                const display =
                  raw !== undefined ? raw
                    : f.type === 'json' ? (stored === undefined ? '' : JSON.stringify(stored, null, 2))
                    : (stored == null ? '' : String(stored))
                return (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                      {f.label}
                    </label>
                    {f.type === 'text' ? (
                      <input
                        type="text"
                        value={display}
                        onChange={e => updateField(idx, f.key, e.target.value, f.type)}
                        disabled={disabled}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                      />
                    ) : (
                      <textarea
                        value={display}
                        onChange={e => updateField(idx, f.key, e.target.value, f.type)}
                        rows={f.rows ?? 3}
                        disabled={disabled}
                        placeholder={f.placeholder}
                        className={`w-full px-3 py-1.5 text-sm border border-border rounded bg-bg text-text-primary focus:outline-none focus:border-accent resize-y disabled:opacity-50 ${f.type === 'json' ? 'font-mono text-xs' : ''}`}
                      />
                    )}
                  </div>
                )
              })}
            </li>
          ))}
        </ol>
      )}

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => commit([...items, { ...emptyTemplate }])}
          disabled={disabled}
          className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
        >
          + Add {itemLabel}
        </button>
      </div>
    </div>
  )
}
