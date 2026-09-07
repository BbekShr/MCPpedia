import type { ReactNode } from 'react'

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export function grade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

export function gradeColor(score: number): string {
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--accent)'
  if (score >= 40) return 'var(--yellow)'
  return 'var(--red)'
}

// The icon registry that used to live here now lives in components/ui/icons.tsx
// so the whole app can reach it without importing from the server-page helpers.
// Re-exported rather than moved outright: 13 components already import `Icon`
// from this module, and the same shim pattern is used by components/home/helpers.tsx.
export { Icon, type IconName } from '@/components/ui/icons'

type ChipTone = 'neutral' | 'green' | 'red' | 'yellow' | 'accent'

export function Chip({
  tone = 'neutral',
  children,
  size = 'sm',
}: {
  tone?: ChipTone
  children: ReactNode
  size?: 'sm' | 'md'
}) {
  const bg = {
    neutral: 'var(--bg-tertiary)',
    green: 'color-mix(in srgb, var(--green) 12%, transparent)',
    red: 'color-mix(in srgb, var(--red) 12%, transparent)',
    yellow: 'color-mix(in srgb, var(--yellow) 14%, transparent)',
    accent: 'color-mix(in srgb, var(--accent) 12%, transparent)',
  }[tone]
  const fg = {
    neutral: 'var(--text-muted)',
    green: 'var(--green)',
    red: 'var(--red)',
    yellow: 'var(--yellow)',
    accent: 'var(--accent)',
  }[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '2px 7px' : '3px 9px',
        borderRadius: 999,
        fontSize: size === 'sm' ? 11.5 : 12.5,
        fontWeight: 500,
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
        border: `1px solid color-mix(in srgb, ${fg} 22%, transparent)`,
      }}
    >
      {children}
    </span>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  right,
  desc,
  id,
}: {
  eyebrow?: string
  title: string
  right?: ReactNode
  desc?: ReactNode
  id?: string
}) {
  return (
    <div
      id={id}
      className="flex items-end justify-between gap-3 mb-3.5"
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-text-muted mb-1">
            {eyebrow}
          </div>
        )}
        <h2 className="text-lg font-semibold leading-tight tracking-tight text-text-primary">{title}</h2>
        {desc && <p className="mt-1 text-[13.5px] text-text-muted">{desc}</p>}
      </div>
      {right}
    </div>
  )
}

export function ScoreRing({
  score,
  size = 84,
  thickness = 7,
}: {
  score: number
  size?: number
  thickness?: number
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const filled = (score / 100) * c
  const color = gradeColor(score)
  const g = grade(score)
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score} of 100, grade ${g}`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={c}
          strokeDashoffset={c - filled}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          style={{
            fontSize: size * 0.3,
            fontWeight: 700,
            color,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {score}
        </div>
        <div
          style={{
            fontSize: size * 0.12,
            fontWeight: 600,
            color,
            opacity: 0.75,
            marginTop: 2,
          }}
        >
          GRADE {g}
        </div>
      </div>
    </div>
  )
}

/** Days between now and an ISO date, or null if no date. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
