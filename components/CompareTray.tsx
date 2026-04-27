'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  clearCompare,
  removeFromCompare,
  useCompareList,
  COMPARE_MAX,
} from '@/lib/compareStore'

export default function CompareTray() {
  const list = useCompareList()
  const pathname = usePathname()

  if (list.length === 0) return null
  if (pathname?.startsWith('/compare/')) return null

  const canCompare = list.length >= 2
  const compareHref = canCompare
    ? `/compare/${list.map(s => s.slug).join('-vs-')}`
    : '#'

  return (
    <div
      role="region"
      aria-label="Server comparison tray"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1rem)]"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-bg-secondary border border-border rounded-full shadow-lg">
        <span className="text-xs text-text-muted shrink-0 pl-1">
          {list.length}/{COMPARE_MAX}
        </span>

        <ul className="flex items-center gap-1.5 flex-wrap" aria-label="Selected servers">
          {list.map(server => (
            <li
              key={server.id}
              className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-bg border border-border rounded-full text-xs text-text-primary"
            >
              <span className="max-w-[120px] truncate">{server.name}</span>
              <button
                onClick={() => removeFromCompare(server.id)}
                className="p-0.5 -mr-0.5 text-text-muted hover:text-text-primary rounded-full"
                aria-label={`Remove ${server.name} from comparison`}
                title={`Remove ${server.name}`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={clearCompare}
          className="text-xs text-text-muted hover:text-text-primary px-2 py-1 shrink-0"
          aria-label="Clear comparison"
        >
          Clear
        </button>

        {canCompare ? (
          <Link
            href={compareHref}
            className="text-sm font-medium px-3 py-1.5 bg-accent text-accent-fg rounded-full hover:bg-accent-hover transition-colors shrink-0"
          >
            Compare {list.length} &rarr;
          </Link>
        ) : (
          <span
            className="text-xs text-text-muted px-2 py-1 shrink-0"
            aria-live="polite"
          >
            Pick at least 2
          </span>
        )}
      </div>
    </div>
  )
}
