'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './helpers'

const SUGGESTIONS = [
  'read files from a directory',
  'query a Postgres database',
  'search GitHub issues',
  'send a Slack message',
  'schedule with Google Calendar',
  'take a webpage screenshot',
  'open a Linear ticket',
  'look up a Stripe customer',
  'search the web with citations',
  'run a SQL query against Snowflake',
]

function RotatingHint({ idx }: { idx: number }) {
  return (
    <span className="relative inline-block min-w-0 flex-1">
      {SUGGESTIONS.map((t, i) => (
        <span
          key={i}
          className="italic whitespace-nowrap"
          style={{
            position: i === idx ? 'relative' : 'absolute',
            left: 0,
            top: 0,
            opacity: i === idx ? 0.85 : 0,
            transform: i === idx ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity .35s ease, transform .35s ease',
          }}
        >
          &ldquo;{t}&rdquo;
        </span>
      ))}
    </span>
  )
}

export default function HeroSearch({ totalServers }: { totalServers: number }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [hintIdx, setHintIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (q || focused) return
    const t = setInterval(() => setHintIdx(i => (i + 1) % SUGGESTIONS.length), 2200)
    return () => clearInterval(t)
  }, [q, focused])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    router.push(query ? `/servers?q=${encodeURIComponent(query)}` : '/servers')
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        onClick={() => inputRef.current?.focus()}
        className="mt-7 flex items-center gap-2.5 px-3.5 py-3 rounded-[10px] text-left"
        style={{
          cursor: 'text',
          background: 'var(--bg)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow: focused
            ? '0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent), var(--shadow-md)'
            : 'var(--shadow-md)',
          transition: 'box-shadow .12s, border-color .12s',
        }}
      >
        <Icon name="search" size={17} />
        <div className="relative flex-1 min-w-0 h-6">
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Search MCP servers"
            className="absolute inset-0 w-full border-0 outline-none bg-transparent p-0 text-base text-text-primary"
            style={{ fontFamily: 'inherit' }}
          />
          {!q && (
            <div className="absolute inset-0 flex items-center pointer-events-none text-text-muted text-base overflow-hidden">
              <span className="whitespace-nowrap">Search&nbsp;</span>
              <span className="text-text-primary opacity-55 whitespace-nowrap">
                {totalServers.toLocaleString()} servers
              </span>
              <span className="hidden sm:inline whitespace-nowrap">&nbsp;—&nbsp;try&nbsp;</span>
              <span className="hidden sm:flex flex-1 min-w-0 overflow-hidden">
                <RotatingHint idx={hintIdx} />
              </span>
            </div>
          )}
        </div>
        <kbd
          className="hidden sm:block font-mono text-[11px] px-1.5 py-0.5 rounded text-text-muted bg-bg-secondary"
          style={{ border: '1px solid var(--border)' }}
        >
          ⌘K
        </kbd>
      </form>

      <div className="mt-3.5 flex gap-1.5 flex-wrap justify-center">
        {['filesystem', 'github', 'postgres', 'slack', 'linear', 'playwright', 'stripe'].map(t => (
          <a
            key={t}
            href={`/servers?q=${encodeURIComponent(t)}`}
            className="chip-btn px-2.5 py-1 text-[12.5px] rounded-full cursor-pointer backdrop-blur text-text-muted"
            style={{
              background: 'color-mix(in srgb, var(--bg-secondary) 75%, transparent)',
              border: '1px solid var(--border-muted)',
            }}
          >
            {t}
          </a>
        ))}
        <a
          href="/servers"
          className="px-2.5 py-1 text-[12.5px] text-accent hover:text-accent-hover"
        >
          Advanced filters →
        </a>
      </div>
    </>
  )
}
