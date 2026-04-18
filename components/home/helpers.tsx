import type { ReactNode } from 'react'

export { Chip, Icon, SectionHeader, formatNumber, grade, gradeColor } from '@/components/server/helpers'

/** Small monogram mark with a category-keyed color — used in tiles/rows. */
export function ServerMark({ name, size = 28 }: { name: string; size?: number }) {
  const tag = (name || '?').slice(0, 3).toUpperCase()
  const palette = [
    'var(--cat-security)',
    'var(--cat-maintenance)',
    'var(--cat-efficiency)',
    'var(--cat-documentation)',
    'var(--cat-compatibility)',
    'var(--accent)',
  ]
  const color = palette[(name || '').length % palette.length]
  return (
    <div
      className="shrink-0 inline-flex items-center justify-center font-mono font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        color,
        fontSize: size * 0.32,
        letterSpacing: '-0.02em',
      }}
    >
      {tag}
    </div>
  )
}

/** Collapse whitespace + strip HTML from a tagline. Returns null if empty. */
export function stripTagline(html: string | null | undefined): string | null {
  if (!html) return null
  const s = html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s || null
}

export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export type IconSlot = ReactNode
