'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { CATEGORIES, CATEGORY_LABELS, HEALTH_STATUSES, TRANSPORTS, API_PRICING_OPTIONS } from '@/lib/constants'
import type { Category, Transport } from '@/lib/constants'

function FilterSelect({
  label,
  paramName,
  options,
  value,
  onChange,
}: {
  label: string
  paramName: string
  options: { value: string; label: string }[]
  value: string
  onChange: (paramName: string, value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(paramName, e.target.value)}
      className={`px-3 py-1.5 text-sm border rounded-md bg-bg focus:outline-none focus:border-accent ${
        value ? 'border-accent text-text-primary' : 'border-border text-text-muted'
      }`}
      aria-label={label}
    >
      <option value="">{label}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

const TRANSPORT_LABELS: Record<Transport, string> = {
  stdio: 'stdio (local)',
  sse: 'SSE (remote)',
  http: 'HTTP (remote)',
}

function FilterBarInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleFilter(paramName: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(paramName, value)
    } else {
      params.delete(paramName)
    }
    params.delete('page')
    router.push(`/servers?${params.toString()}`)
  }

  function clearFilter(paramName: string) {
    handleFilter(paramName, '')
  }

  function clearAll() {
    const params = new URLSearchParams()
    const q = searchParams.get('q')
    if (q) params.set('q', q)
    router.push(`/servers?${params.toString()}`)
  }

  const sortOptions = [
    { value: '', label: 'Score (default)' },
    { value: 'stars', label: 'Most Stars' },
    { value: 'downloads', label: 'Most Downloads' },
    { value: 'commit', label: 'Last Commit' },
    { value: 'newest', label: 'Newest' },
    { value: 'name', label: 'Name (A-Z)' },
  ]

  // Collect active filters for pills
  const activeFilters: { param: string; label: string; value: string }[] = []
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  const transport = searchParams.get('transport')
  const author = searchParams.get('author')
  const pricing = searchParams.get('pricing')
  if (category) activeFilters.push({ param: 'category', label: CATEGORY_LABELS[category as Category] || category, value: category })
  if (status) activeFilters.push({ param: 'status', label: status.charAt(0).toUpperCase() + status.slice(1), value: status })
  if (transport) activeFilters.push({ param: 'transport', label: TRANSPORT_LABELS[transport as Transport] || transport, value: transport })
  if (author) activeFilters.push({ param: 'author', label: author === 'official' ? 'Official' : 'Community', value: author })
  if (pricing) activeFilters.push({ param: 'pricing', label: pricing.charAt(0).toUpperCase() + pricing.slice(1), value: pricing })

  const [moreOpen, setMoreOpen] = useState(false)
  const moreFilterCount = [status, transport, author, pricing].filter(Boolean).length

  return (
    <div>
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Always visible: Category + Sort */}
        <FilterSelect
          label="Category"
          paramName="category"
          options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c as Category] || c }))}
          value={category || ''}
          onChange={handleFilter}
        />

        {/* More filters — visible on desktop, behind toggle on mobile */}
        <div className="hidden sm:contents">
          <FilterSelect
            label="Status"
            paramName="status"
            options={HEALTH_STATUSES.filter(s => s !== 'unknown').map(s => ({
              value: s,
              label: s.charAt(0).toUpperCase() + s.slice(1),
            }))}
            value={status || ''}
            onChange={handleFilter}
          />
          <FilterSelect
            label="Transport"
            paramName="transport"
            options={TRANSPORTS.map(t => ({
              value: t,
              label: TRANSPORT_LABELS[t],
            }))}
            value={transport || ''}
            onChange={handleFilter}
          />
          <FilterSelect
            label="Author"
            paramName="author"
            options={[
              { value: 'official', label: 'Official' },
              { value: 'community', label: 'Community' },
            ]}
            value={author || ''}
            onChange={handleFilter}
          />
          <FilterSelect
            label="Pricing"
            paramName="pricing"
            options={API_PRICING_OPTIONS.filter(p => p !== 'unknown').map(p => ({
              value: p,
              label: p.charAt(0).toUpperCase() + p.slice(1),
            }))}
            value={pricing || ''}
            onChange={handleFilter}
          />
        </div>

        {/* Mobile: "More filters" toggle */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`sm:hidden px-3 py-1.5 text-sm border rounded-md ${
            moreFilterCount > 0 ? 'border-accent text-accent' : 'border-border text-text-muted'
          }`}
        >
          Filters{moreFilterCount > 0 ? ` (${moreFilterCount})` : ''}
        </button>

        <div className="flex-1" />

        <FilterSelect
          label="Sort by"
          paramName="sort"
          options={sortOptions}
          value={searchParams.get('sort') || ''}
          onChange={handleFilter}
        />
      </div>

      {/* Mobile expanded filters */}
      {moreOpen && (
        <div className="sm:hidden flex flex-wrap gap-2 mt-2 p-3 border border-border rounded-md bg-bg-secondary">
          <FilterSelect label="Status" paramName="status" options={HEALTH_STATUSES.filter(s => s !== 'unknown').map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} value={status || ''} onChange={handleFilter} />
          <FilterSelect label="Transport" paramName="transport" options={TRANSPORTS.map(t => ({ value: t, label: TRANSPORT_LABELS[t] }))} value={transport || ''} onChange={handleFilter} />
          <FilterSelect label="Author" paramName="author" options={[{ value: 'official', label: 'Official' }, { value: 'community', label: 'Community' }]} value={author || ''} onChange={handleFilter} />
          <FilterSelect label="Pricing" paramName="pricing" options={API_PRICING_OPTIONS.filter(p => p !== 'unknown').map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))} value={pricing || ''} onChange={handleFilter} />
        </div>
      )}

      {/* Active filter pills */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {activeFilters.map(f => (
            <button
              key={f.param}
              onClick={() => clearFilter(f.param)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              {f.label}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-text-muted hover:text-text-primary ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

export default function FilterBar() {
  return (
    <Suspense fallback={<div className="h-9" />}>
      <FilterBarInner />
    </Suspense>
  )
}
