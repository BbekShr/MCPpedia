import type { ReactNode } from 'react'

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
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

type IconName =
  | 'shield' | 'check' | 'x' | 'alert' | 'star' | 'download' | 'copy'
  | 'external' | 'verified' | 'clock' | 'wrench' | 'chevronR'
  | 'gauge' | 'package' | 'flag' | 'gitBranch' | 'search' | 'heart'

const ICON_PATHS: Record<IconName, ReactNode> = {
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  check: <polyline points="20 6 9 17 4 12" />,
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  alert: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />,
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  external: (
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>
  ),
  verified: (
    <>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  chevronR: <polyline points="9 18 15 12 9 6" />,
  gauge: (
    <>
      <path d="M12 14l4-4" />
      <path d="M3.34 19A10 10 0 1 1 20.66 19" />
    </>
  ),
  package: (
    <>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  gitBranch: (
    <>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
}

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0 }}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

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
