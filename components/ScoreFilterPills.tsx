'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const SCORE_TIERS = [
  { label: 'A (80+)', value: '80', color: 'border-green/30 text-green hover:bg-green/10' },
  { label: 'B (60+)', value: '60', color: 'border-accent/30 text-accent hover:bg-accent/10' },
  { label: 'C (40+)', value: '40', color: 'border-yellow/30 text-yellow hover:bg-yellow/10' },
  { label: 'All scores', value: '', color: 'border-border text-text-muted hover:bg-bg-tertiary' },
]

function ScoreFilterPillsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentMin = searchParams.get('min_score') || ''

  function setMinScore(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('min_score', value)
    } else {
      params.delete('min_score')
    }
    params.delete('page')
    const url = `/servers?${params.toString()}`
    router.replace(url)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-text-muted font-medium">Score:</span>
      {SCORE_TIERS.map(tier => (
        <button
          key={tier.value}
          onClick={() => setMinScore(tier.value)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            currentMin === tier.value
              ? `${tier.color} bg-opacity-10 font-semibold`
              : `${tier.color} font-medium`
          } ${currentMin === tier.value ? 'ring-1 ring-current' : ''}`}
          aria-pressed={currentMin === tier.value}
          aria-label={`Filter by minimum score ${tier.label}`}
        >
          {tier.label}
        </button>
      ))}
    </div>
  )
}

export default function ScoreFilterPills() {
  return (
    <Suspense fallback={null}>
      <ScoreFilterPillsInner />
    </Suspense>
  )
}
