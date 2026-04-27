'use client'

import { useCallback } from 'react'
import {
  addToCompare,
  removeFromCompare,
  useCompareList,
  COMPARE_MAX,
  type CompareItem,
} from '@/lib/compareStore'

interface Props {
  item: CompareItem
  className?: string
}

export default function CompareToggleButton({ item, className = '' }: Props) {
  const list = useCompareList()
  const inList = list.some(x => x.id === item.id)
  const atCap = !inList && list.length >= COMPARE_MAX

  const toggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (inList) {
      removeFromCompare(item.id)
    } else {
      addToCompare(item)
    }
  }, [inList, item])

  const label = inList
    ? 'Remove from comparison'
    : atCap
      ? `Comparison full — max ${COMPARE_MAX} servers`
      : 'Add to comparison'

  return (
    <button
      onClick={toggle}
      disabled={atCap}
      className={`group inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={inList}
    >
      {inList ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="var(--accent)"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M9 12l2 2 4-4" stroke="var(--accent-fg, #fff)" fill="none" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all group-hover:stroke-[var(--accent)] group-hover:scale-110"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      )}
    </button>
  )
}
