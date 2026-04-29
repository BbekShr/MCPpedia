'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon, grade, gradeColor, stripTagline } from './helpers'

type Suggestion = {
  slug: string
  name: string
  tagline: string | null
  score_total: number | null
}

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
  const [results, setResults] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [open, setOpen] = useState(false)
  const [dropdownMaxH, setDropdownMaxH] = useState(480)
  const [placement, setPlacement] = useState<'below' | 'above'>('below')
  const [scrollState, setScrollState] = useState<'top' | 'middle' | 'bottom' | 'none'>('none')
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q || focused) return
    const t = setInterval(() => setHintIdx(i => (i + 1) % SUGGESTIONS.length), 2200)
    return () => clearInterval(t)
  }, [q, focused])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    function compute() {
      const form = formRef.current
      if (!form) return
      const rect = form.getBoundingClientRect()
      const nav = document.querySelector('nav[aria-label="Primary"]') as HTMLElement | null
      const navBottom = nav?.getBoundingClientRect().bottom ?? 0
      const spaceBelow = window.innerHeight - rect.bottom - 16
      const spaceAbove = rect.top - Math.max(navBottom, 16) - 8
      const useAbove = spaceBelow < 280 && spaceAbove > spaceBelow
      const available = useAbove ? spaceAbove : spaceBelow
      setPlacement(useAbove ? 'above' : 'below')
      setDropdownMaxH(Math.max(220, Math.min(available, 480)))
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !open) {
      setScrollState('none')
      return
    }
    const id = requestAnimationFrame(() => {
      const overflows = el.scrollHeight > el.clientHeight + 1
      setScrollState(overflows ? 'top' : 'none')
    })
    return () => cancelAnimationFrame(id)
  }, [open, results, dropdownMaxH])

  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      setActiveIdx(-1)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=5`,
          { signal: ctrl.signal }
        )
        if (!r.ok) throw new Error('search failed')
        const data = await r.json()
        setResults(Array.isArray(data.servers) ? data.servers : [])
        setActiveIdx(-1)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 150)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  function goToServer(slug: string) {
    setOpen(false)
    router.push(`/s/${slug}`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (open && activeIdx >= 0 && activeIdx < results.length) {
      goToServer(results[activeIdx].slug)
      return
    }
    setOpen(false)
    router.push(query ? `/servers?q=${encodeURIComponent(query)}` : '/servers')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i <= 0 ? results.length - 1 : i - 1))
    }
  }

  const trimmed = q.trim()
  const showDropdown = open && trimmed.length >= 2

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative mt-7">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onClick={() => inputRef.current?.focus()}
        className="flex items-center gap-2.5 px-3.5 py-3 rounded-[10px] text-left"
        style={{
          cursor: 'text',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          boxShadow: focused
            ? '0 1px 2px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.06)'
            : 'var(--shadow-md)',
          transition: 'box-shadow .15s ease',
        }}
      >
        <Icon name="search" size={17} />
        <div className="relative flex-1 min-w-0 h-6">
          <input
            ref={inputRef}
            value={q}
            onChange={e => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => {
              setFocused(true)
              if (q.trim().length >= 2) setOpen(true)
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            aria-label="Search MCP servers"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls="hero-search-results"
            aria-activedescendant={
              activeIdx >= 0 && results[activeIdx]
                ? `hero-search-opt-${results[activeIdx].slug}`
                : undefined
            }
            role="combobox"
            className="hero-search-input absolute inset-0 w-full border-0 bg-transparent p-0 text-base text-text-primary"
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

      {showDropdown && (
        <div
          id="hero-search-results"
          role="listbox"
          className="absolute left-0 right-0 rounded-[10px] z-30 text-left flex flex-col"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.12))',
            maxHeight: dropdownMaxH,
            overflow: 'hidden',
            ...(placement === 'above'
              ? { bottom: '100%', marginBottom: 6 }
              : { top: '100%', marginTop: 6 }),
          }}
        >
          <div
            ref={scrollRef}
            className="hero-search-scroll flex-1 min-h-0 relative"
            style={{ overflowY: 'auto' }}
            onScroll={e => {
              const el = e.currentTarget
              const atTop = el.scrollTop <= 1
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 1
              const overflows = el.scrollHeight > el.clientHeight + 1
              if (!overflows) setScrollState('none')
              else if (atTop) setScrollState('top')
              else if (atBottom) setScrollState('bottom')
              else setScrollState('middle')
            }}
          >
          {loading && results.length === 0 ? (
            <div className="px-3.5 py-3 text-sm text-text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3.5 py-3 text-sm text-text-muted">
              No matches for &ldquo;{trimmed}&rdquo;
            </div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {results.map((r, i) => {
                const tagline = stripTagline(r.tagline)
                return (
                  <li key={r.slug} role="option" aria-selected={i === activeIdx}>
                    <a
                      id={`hero-search-opt-${r.slug}`}
                      href={`/s/${r.slug}`}
                      onMouseDown={e => {
                        e.preventDefault()
                        goToServer(r.slug)
                      }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className="flex items-center gap-3 px-3.5 py-2.5"
                      style={{
                        background: i === activeIdx ? 'var(--bg-secondary)' : 'transparent',
                        textDecoration: 'none',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary font-medium truncate">
                          {r.name}
                        </div>
                        {tagline && (
                          <div className="text-xs text-text-muted truncate">{tagline}</div>
                        )}
                      </div>
                      {typeof r.score_total === 'number' && (
                        <span
                          className="text-xs font-mono font-semibold shrink-0"
                          style={{ color: gradeColor(r.score_total) }}
                        >
                          {grade(r.score_total)}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
          </div>
          {(scrollState === 'top' || scrollState === 'middle') && (
            <div
              aria-hidden
              className="pointer-events-none shrink-0"
              style={{
                height: 24,
                marginTop: -24,
                background: 'linear-gradient(to bottom, transparent, var(--bg))',
              }}
            />
          )}
          <a
            href={`/servers?q=${encodeURIComponent(trimmed)}`}
            onMouseDown={e => {
              e.preventDefault()
              setOpen(false)
              router.push(`/servers?q=${encodeURIComponent(trimmed)}`)
            }}
            className="block px-3.5 py-2.5 text-xs text-accent hover:text-accent-hover shrink-0"
            style={{ borderTop: '1px solid var(--border-muted)', textDecoration: 'none' }}
          >
            See all results for &ldquo;{trimmed}&rdquo; →
          </a>
        </div>
      )}
      </div>

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
    </div>
  )
}
