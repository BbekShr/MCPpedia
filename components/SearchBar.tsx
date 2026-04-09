'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useRef, useState, useEffect, Suspense, useId } from 'react'
import Link from 'next/link'

interface Suggestion {
  slug: string
  name: string
  tagline: string | null
  score_total: number
}

function SearchBarInner({
  placeholder = 'Search MCP servers...',
  action = '/servers',
  large = false,
}: {
  placeholder?: string
  action?: string
  large?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track the latest query we sent so stale responses are ignored
  const latestQueryRef = useRef('')
  const listboxId = useId()

  const popularSearches = ['supabase', 'github', 'slack', 'postgres', 'memory', 'filesystem', 'browser', 'docker']

  const isOnServersPage = pathname === '/servers' || pathname === action

  // Sync with URL on /servers page only
  useEffect(() => {
    if (isOnServersPage) setQuery(searchParams.get('q') || '')
  }, [searchParams, isOnServersPage])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function fetchSuggestions(value: string) {
    // Always cancel previous debounce + fetch
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    const trimmed = value.trim()
    latestQueryRef.current = trimmed

    if (!trimmed) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=6`,
          { signal: controller.signal }
        )
        if (!res.ok) return
        const data = await res.json()

        // Only apply if this is still the latest query
        if (latestQueryRef.current === trimmed) {
          setSuggestions(data.servers || [])
          setShowDropdown(true)
          setActiveIndex(-1)
        }
      } catch {
        // Aborted or network error — ignore
      }
    }, 150)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)
    fetchSuggestions(value)
  }

  function navigateToResults(q: string) {
    setShowDropdown(false)
    const params = new URLSearchParams(isOnServersPage ? searchParams.toString() : '')
    if (q.trim()) {
      params.set('q', q.trim())
    } else {
      params.delete('q')
    }
    params.delete('page')
    router.push(`${action}?${params.toString()}`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      setShowDropdown(false)
      router.push(`/s/${suggestions[activeIndex].slug}`)
    } else {
      navigateToResults(query)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setShowDropdown(false)
      setIsFocused(false)
      inputRef.current?.blur()
      return
    }

    if (!showDropdown || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => Math.max(prev - 1, -1))
    }
  }

  function handlePopularSearch(term: string) {
    setQuery(term)
    setIsFocused(false)
    setShowDropdown(false)
    // Navigate to results with the popular search term
    const params = new URLSearchParams(isOnServersPage ? searchParams.toString() : '')
    params.set('q', term)
    params.delete('page')
    router.push(`${action}?${params.toString()}`)
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`absolute left-3 text-text-muted ${large ? 'top-4' : 'top-2.5'}`}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            name="q"
            value={query}
            onChange={handleChange}
            onFocus={() => {
              setIsFocused(true)
              if (suggestions.length > 0 && query.trim()) setShowDropdown(true)
            }}
            onBlur={() => {
              setIsFocused(false)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown && suggestions.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
            aria-label="Search MCP servers"
            className={`w-full border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors duration-150 ${
              large ? 'pl-10 pr-4 py-3 text-base' : 'pl-10 pr-4 py-2 text-sm'
            }`}
          />
        </div>
      </form>

      {/* Popular searches - shown when focused and empty */}
      {isFocused && !query && (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-xs text-text-muted">Popular:</span>
          {popularSearches.map(term => (
            <button
              key={term}
              onMouseDown={(e) => {
                e.preventDefault()
                handlePopularSearch(term)
              }}
              className="text-xs px-3 py-1.5 rounded-full border border-border text-text-muted hover:text-accent hover:border-accent/30 transition-colors min-h-[36px]"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute z-50 w-full mt-1 bg-bg border border-border rounded-md shadow-[var(--shadow-lg)] overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <Link
              key={s.slug}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              href={`/s/${s.slug}`}
              onClick={() => setShowDropdown(false)}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                i === activeIndex ? 'bg-bg-secondary' : 'hover:bg-bg-secondary'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary truncate">{s.name}</div>
                {s.tagline && <div className="text-xs text-text-muted truncate">{s.tagline}</div>}
              </div>
              {s.score_total > 0 && (
                <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 rounded border ${
                  s.score_total >= 80 ? 'bg-green/10 text-green border-green/20' :
                  s.score_total >= 60 ? 'bg-accent/10 text-accent border-accent/20' :
                  s.score_total >= 40 ? 'bg-yellow/10 text-yellow border-yellow/20' :
                  'bg-bg-tertiary text-text-muted border-border'
                }`}>
                  {s.score_total}
                </span>
              )}
            </Link>
          ))}
          <button
            onClick={() => navigateToResults(query)}
            className="w-full border-t border-border px-3 py-2 text-left text-xs text-accent hover:text-accent-hover hover:bg-bg-secondary"
          >
            View all results for &ldquo;{query}&rdquo; &rarr;
          </button>
        </div>
      )}
    </div>
  )
}

export default function SearchBar(props: {
  placeholder?: string
  action?: string
  large?: boolean
}) {
  return (
    <Suspense fallback={
      <div className="w-full">
        <div className={`border border-border rounded-md bg-bg ${props.large ? 'h-12' : 'h-9'}`} />
      </div>
    }>
      <SearchBarInner {...props} />
    </Suspense>
  )
}
