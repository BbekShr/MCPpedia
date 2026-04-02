'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { CATEGORIES, CATEGORY_LABELS, HEALTH_STATUSES, API_PRICING_OPTIONS } from '@/lib/constants'
import type { Category } from '@/lib/constants'

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
      className="px-3 py-1.5 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent"
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

  const sortOptions = [
    { value: '', label: 'Relevance' },
    { value: 'stars', label: 'Most Stars' },
    { value: 'newest', label: 'Newest' },
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'downloads', label: 'Most Downloads' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Category"
        paramName="category"
        options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABELS[c as Category] || c }))}
        value={searchParams.get('category') || ''}
        onChange={handleFilter}
      />
      <FilterSelect
        label="Status"
        paramName="status"
        options={HEALTH_STATUSES.filter(s => s !== 'unknown').map(s => ({
          value: s,
          label: s.charAt(0).toUpperCase() + s.slice(1),
        }))}
        value={searchParams.get('status') || ''}
        onChange={handleFilter}
      />
      <FilterSelect
        label="Author"
        paramName="author"
        options={[
          { value: 'official', label: 'Official' },
          { value: 'community', label: 'Community' },
        ]}
        value={searchParams.get('author') || ''}
        onChange={handleFilter}
      />
      <FilterSelect
        label="API Pricing"
        paramName="pricing"
        options={API_PRICING_OPTIONS.filter(p => p !== 'unknown').map(p => ({
          value: p,
          label: p.charAt(0).toUpperCase() + p.slice(1),
        }))}
        value={searchParams.get('pricing') || ''}
        onChange={handleFilter}
      />

      <div className="flex-1" />

      <FilterSelect
        label="Sort by"
        paramName="sort"
        options={sortOptions}
        value={searchParams.get('sort') || ''}
        onChange={handleFilter}
      />
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
