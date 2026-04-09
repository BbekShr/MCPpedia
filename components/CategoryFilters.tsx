'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Suspense } from 'react'

const SORT_OPTIONS = [
  { value: 'score', label: 'Top Score' },
  { value: 'stars', label: 'Most Stars' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'newest', label: 'Newest' },
  { value: 'commit', label: 'Recently Updated' },
  { value: 'name', label: 'Name' },
]

const HEALTH_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'maintained', label: 'Maintained' },
  { value: 'stale', label: 'Stale' },
  { value: 'abandoned', label: 'Abandoned' },
]

const TRANSPORT_OPTIONS = [
  { value: '', label: 'Any transport' },
  { value: 'stdio', label: 'stdio' },
  { value: 'sse', label: 'SSE' },
  { value: 'http', label: 'HTTP' },
]

const SCORE_TIERS = [
  { label: 'All', value: '', color: 'border-border text-text-muted hover:bg-bg-tertiary' },
  { label: 'A (80+)', value: '80', color: 'border-green/30 text-green hover:bg-green/10' },
  { label: 'B (60+)', value: '60', color: 'border-accent/30 text-accent hover:bg-accent/10' },
  { label: 'C (40+)', value: '40', color: 'border-yellow/30 text-yellow hover:bg-yellow/10' },
]

function CategoryFiltersInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const sort = searchParams.get('sort') || 'score'
  const status = searchParams.get('status') || ''
  const transport = searchParams.get('transport') || ''
  const minScore = searchParams.get('min_score') || ''
  const q = searchParams.get('q') || ''

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // Reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      {/* Search within category */}
      <div className="relative">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-2.5 text-text-muted"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => updateParam('q', e.target.value)}
          placeholder="Filter servers in this category..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          aria-label="Filter servers in this category"
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className={`px-3 py-1.5 text-sm border rounded-md bg-bg focus:outline-none focus:border-accent min-h-[36px] ${
            sort !== 'score' ? 'border-accent text-text-primary' : 'border-border text-text-muted'
          }`}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Health status */}
        <select
          value={status}
          onChange={(e) => updateParam('status', e.target.value)}
          className={`px-3 py-1.5 text-sm border rounded-md bg-bg focus:outline-none focus:border-accent min-h-[36px] ${
            status ? 'border-accent text-text-primary' : 'border-border text-text-muted'
          }`}
          aria-label="Health status"
        >
          {HEALTH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Transport */}
        <select
          value={transport}
          onChange={(e) => updateParam('transport', e.target.value)}
          className={`px-3 py-1.5 text-sm border rounded-md bg-bg focus:outline-none focus:border-accent min-h-[36px] ${
            transport ? 'border-accent text-text-primary' : 'border-border text-text-muted'
          }`}
          aria-label="Transport type"
        >
          {TRANSPORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Divider */}
        <span className="hidden sm:block w-px h-5 bg-border" />

        {/* Score tier pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-medium">Score:</span>
          {SCORE_TIERS.map(tier => (
            <button
              key={tier.value}
              onClick={() => updateParam('min_score', tier.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors min-h-[32px] ${tier.color} ${
                minScore === tier.value ? 'ring-1 ring-current font-semibold' : 'font-medium'
              }`}
              aria-pressed={minScore === tier.value}
              aria-label={tier.value ? `Minimum score ${tier.label}` : 'All scores'}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CategoryFilters() {
  return (
    <Suspense fallback={
      <div className="space-y-3">
        <div className="h-9 border border-border rounded-md bg-bg animate-pulse" />
        <div className="flex gap-3">
          <div className="h-9 w-28 border border-border rounded-md bg-bg animate-pulse" />
          <div className="h-9 w-28 border border-border rounded-md bg-bg animate-pulse" />
        </div>
      </div>
    }>
      <CategoryFiltersInner />
    </Suspense>
  )
}
