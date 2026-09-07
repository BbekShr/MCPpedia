'use client'

import { useCallback } from 'react'
import {
  addToCompare,
  removeFromCompare,
  useCompareList,
  COMPARE_MAX,
  type CompareItem,
} from '@/lib/compareStore'
import { Icon } from '@/components/ui/icons'

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
      ? `Comparison full - max ${COMPARE_MAX} servers`
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
        <Icon name="checkboxOn" size={16} style={{ color: 'var(--accent)' }} />
      ) : (
        <Icon name="squarePlus" size={16} className="transition-all group-hover:stroke-[var(--accent)] group-hover:scale-110" />
      )}
    </button>
  )
}
