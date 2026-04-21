// Karma tiers and action-to-point mappings.
//
// Point values must match the migration at
// supabase/migrations/20260421030000_karma.sql. The migration is the source of
// truth (it writes the points column in karma_events); these constants are for
// rendering labels and progress in the UI.

export const KARMA_POINTS = {
  submit_server: 15,
  edit_approved: 5,
  edit_proposed: 1,
  discussion_post: 2,
  verification: 1,
} as const

export interface KarmaTier {
  name: string
  min: number
  /** Lower bound of the next tier; null if this is the top tier. */
  next: number | null
  /** Tailwind color classes for a badge/pill. */
  badgeClass: string
  /** Accent used for the progress bar fill. */
  barClass: string
  blurb: string
}

const TIERS: readonly KarmaTier[] = [
  {
    name: 'Newcomer',
    min: 0,
    next: 10,
    badgeClass: 'bg-bg-tertiary text-text-muted',
    barClass: 'bg-text-muted',
    blurb: 'Just getting started.',
  },
  {
    name: 'Contributor',
    min: 10,
    next: 50,
    badgeClass: 'bg-accent/10 text-accent',
    barClass: 'bg-accent',
    blurb: 'Making the catalog better.',
  },
  {
    name: 'Regular',
    min: 50,
    next: 200,
    badgeClass: 'bg-green/10 text-green',
    barClass: 'bg-green',
    blurb: 'A trusted contributor.',
  },
  {
    name: 'Core',
    min: 200,
    next: 1000,
    badgeClass: 'bg-yellow/15 text-yellow',
    barClass: 'bg-yellow',
    blurb: 'Shaping MCPpedia daily.',
  },
  {
    name: 'Maintainer',
    min: 1000,
    next: null,
    badgeClass: 'bg-red/10 text-red',
    barClass: 'bg-red',
    blurb: 'Top of the leaderboard.',
  },
]

export function getKarmaTier(karma: number): KarmaTier {
  const safe = Math.max(0, Math.floor(karma || 0))
  let match = TIERS[0]
  for (const tier of TIERS) {
    if (safe >= tier.min) match = tier
  }
  return match
}

export function getKarmaProgress(karma: number): {
  tier: KarmaTier
  next: KarmaTier | null
  /** 0–1 progress within the current tier. 1.0 if already at the top tier. */
  pct: number
  /** Points needed to reach the next tier; null at top. */
  toNext: number | null
} {
  const tier = getKarmaTier(karma)
  if (tier.next === null) {
    return { tier, next: null, pct: 1, toNext: null }
  }
  const next = TIERS.find(t => t.min === tier.next) ?? null
  const span = tier.next - tier.min
  const within = Math.max(0, Math.min(span, karma - tier.min))
  return {
    tier,
    next,
    pct: span > 0 ? within / span : 1,
    toNext: Math.max(0, tier.next - karma),
  }
}
