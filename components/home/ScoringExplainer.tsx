import Link from 'next/link'
import { SCORE_WEIGHTS } from '@/lib/scoring'
import { SectionHeader } from './helpers'

const PILLARS: { key: string; label: string; weight: number; color: string; blurb: string }[] = [
  {
    key: 'security',
    label: 'Security',
    weight: SCORE_WEIGHTS.security,
    color: 'var(--cat-security)',
    blurb: 'CVEs, auth hygiene, sandboxing, permission model.',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    weight: SCORE_WEIGHTS.maintenance,
    color: 'var(--cat-maintenance)',
    blurb: 'Commit cadence, open-issue health, release frequency.',
  },
  {
    key: 'efficiency',
    label: 'Token efficiency',
    weight: SCORE_WEIGHTS.efficiency,
    color: 'var(--cat-efficiency)',
    blurb: 'How much of the context window tool schemas consume.',
  },
  {
    key: 'documentation',
    label: 'Documentation',
    weight: SCORE_WEIGHTS.documentation,
    color: 'var(--cat-documentation)',
    blurb: 'README quality, examples, transport docs, changelog.',
  },
  {
    key: 'compatibility',
    label: 'Compatibility',
    weight: SCORE_WEIGHTS.compatibility,
    color: 'var(--cat-compatibility)',
    blurb: 'Clients tested, transports supported, platforms.',
  },
]

export default function ScoringExplainer() {
  return (
    <section
      style={{
        padding: 'var(--section-pad) 0',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-muted)',
        borderBottom: '1px solid var(--border-muted)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <SectionHeader
          eyebrow="How we score"
          title="What the number actually means"
          desc="Every server gets a 0–100 grade from five weighted signals. No opinion — only what we can measure from source, registry, and runtime."
          right={
            <Link href="/methodology" className="text-[13px] text-accent">
              Scoring rubric →
            </Link>
          }
        />

        <div
          className="rounded-lg bg-bg"
          style={{ border: '1px solid var(--border)', padding: 'var(--card-pad)' }}
        >
          {/* 100-point bar */}
          <div
            className="flex overflow-hidden rounded-md"
            style={{ height: 14, border: '1px solid var(--border)' }}
          >
            {PILLARS.map(p => (
              <div
                key={p.key}
                className="flex items-center justify-center font-mono font-semibold text-white"
                style={{
                  width: `${p.weight}%`,
                  height: '100%',
                  background: p.color,
                  fontSize: 10,
                  letterSpacing: '0.02em',
                }}
              >
                {p.weight}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            {PILLARS.map(p => (
              <div key={p.key}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="shrink-0 rounded-sm"
                    style={{ width: 8, height: 8, background: p.color }}
                  />
                  <span className="text-[13px] font-semibold">{p.label}</span>
                  <span className="font-mono ml-auto text-[11px] text-text-muted">
                    {p.weight} pts
                  </span>
                </div>
                <p
                  className="m-0 text-xs text-text-muted"
                  style={{ lineHeight: 1.5, textWrap: 'pretty' }}
                >
                  {p.blurb}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3.5 text-xs text-text-muted flex flex-col sm:flex-row sm:flex-wrap sm:justify-between gap-1 sm:gap-2">
          <span>
            Grades:{' '}
            <b style={{ color: 'var(--green)' }}>A (≥80)</b> ·{' '}
            <b style={{ color: 'var(--accent)' }}>B (60–79)</b> ·{' '}
            <b style={{ color: 'var(--yellow)' }}>C (40–59)</b> ·{' '}
            <b style={{ color: 'var(--red)' }}>D/F (&lt;40)</b>
          </span>
          <span className="hidden sm:inline">Scoring is open-source and versioned — the rubric file is in the repo.</span>
        </div>
      </div>
    </section>
  )
}
