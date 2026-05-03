'use client'

import { useMemo, useState } from 'react'
import type { Tool } from '@/lib/types'
import { Icon, formatNumber } from './helpers'
import InlineMarkdown from '@/components/InlineMarkdown'

export default function ToolInspector({
  tools,
  totalTokens,
}: {
  tools: Tool[]
  totalTokens?: number | null
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q) return tools
    const needle = q.toLowerCase()
    return tools.filter(
      t =>
        t.name.toLowerCase().includes(needle) ||
        (t.description ?? '').toLowerCase().includes(needle),
    )
  }, [tools, q])

  return (
    <div>
      <div className="flex gap-2 items-center mb-2.5 flex-wrap">
        <div className="relative flex-1 max-w-[320px] min-w-0">
          <span
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            aria-hidden="true"
          >
            <Icon name="search" size={13} />
          </span>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={`Search ${tools.length} tool${tools.length !== 1 ? 's' : ''}…`}
            aria-label={`Search ${tools.length} tools`}
            className="w-full pl-7 pr-2.5 py-1.5 text-[13px] rounded-md bg-bg text-text-primary outline-none font-sans"
            style={{ border: '1px solid var(--border)' }}
          />
        </div>
        {totalTokens ? (
          <span className="text-xs text-text-muted">~{formatNumber(totalTokens)} tokens total</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        {filtered.map(t => {
          const isOpen = open === t.name
          const hasSchema = !!(t.input_schema && Object.keys(t.input_schema).length > 0)
          return (
            <div
              key={t.name}
              className="rounded-md"
              style={{
                border: '1px solid var(--border)',
                background: isOpen ? 'var(--bg-secondary)' : 'var(--bg)',
                transition: 'background 150ms',
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : t.name)}
                aria-expanded={isOpen}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left bg-transparent border-0 cursor-pointer text-text-primary"
              >
                <span
                  className="text-text-muted inline-flex"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
                  aria-hidden="true"
                >
                  <Icon name="chevronR" size={12} />
                </span>
                <code className="font-mono text-[12.5px] font-semibold">{t.name}</code>
                {t.description && (
                  <span className="flex-1 text-[12.5px] text-text-muted truncate">{t.description}</span>
                )}
              </button>
              {isOpen && (
                <div className="animate-fadeInUp pl-8 pr-3 pb-3 flex flex-col gap-2">
                  {t.description && <InlineMarkdown className="text-[13px]">{t.description}</InlineMarkdown>}
                  {hasSchema && (
                    <div>
                      <div className="font-mono text-[10.5px] uppercase tracking-wider text-text-muted mb-1">
                        Input schema
                      </div>
                      <pre
                        className="m-0 font-mono text-[12.5px] leading-[1.55] rounded-md p-3 overflow-auto"
                        style={{
                          background: 'var(--code-bg)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <code>{JSON.stringify(t.input_schema, null, 2)}</code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="p-5 text-center text-[13px] text-text-muted">
            No tools match &ldquo;{q}&rdquo;.
          </div>
        )}
      </div>
    </div>
  )
}
