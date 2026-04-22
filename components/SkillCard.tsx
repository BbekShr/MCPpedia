import Link from 'next/link'
import type { Skill } from '@/lib/skills'
import { SKILL_CATEGORY_ICONS, SKILL_CATEGORY_LABELS } from '@/lib/skills'

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

const TYPE_LABELS: Record<Skill['type'], string> = {
  'plugin': 'Plugin',
  'skill': 'Skill',
  'skill-collection': 'Collection',
  'marketplace': 'Marketplace',
}

export default function SkillCard({ skill }: { skill: Skill }) {
  const a11yLabel = `${skill.name} — ${skill.tagline}${skill.stars ? `, ${formatNumber(skill.stars)} stars` : ''}`
  return (
    <article className="group relative block border border-border rounded-md p-4 bg-bg hover:shadow-[var(--shadow-card-hover),inset_3px_0_0_var(--accent)] hover:-translate-y-[1px] transition-all duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-accent">
      <Link
        href={`/skills/${skill.slug}`}
        aria-label={a11yLabel}
        className="absolute inset-0 z-0 rounded-md"
      >
        <span className="sr-only">View {skill.name}</span>
      </Link>

      {/* Row 1: Icon + name */}
      <div className="relative z-10 flex items-start gap-2.5 mb-2 pointer-events-none">
        <span className="text-xl leading-none pt-0.5" aria-hidden="true">
          {SKILL_CATEGORY_ICONS[skill.category]}
        </span>
        <h3 className="flex-1 min-w-0 font-semibold text-text-primary leading-tight text-[15px] line-clamp-2 pt-0.5">
          {skill.name}
        </h3>
      </div>

      {/* Row 2: Badges */}
      <div className="relative z-10 flex flex-wrap items-center gap-1.5 mb-2 pointer-events-none">
        {skill.author_type === 'official' && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Official</span>
        )}
        {skill.featured && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-green/10 text-green font-medium">Featured</span>
        )}
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium">
          {TYPE_LABELS[skill.type]}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium">
          {SKILL_CATEGORY_LABELS[skill.category]}
        </span>
      </div>

      {/* Row 3: Tagline */}
      <p className="relative z-10 text-sm text-text-muted mb-2.5 line-clamp-2 pointer-events-none">
        {skill.tagline}
      </p>

      {/* Row 4: Signals */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted pointer-events-none">
        {skill.stars > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {formatNumber(skill.stars)}
          </span>
        )}
        <span className="shrink-0">{skill.compatible_with.length} agents</span>
        {skill.license && skill.license !== 'NOASSERTION' && (
          <span className="shrink-0">{skill.license}</span>
        )}
        {skill.last_updated && (
          <span className="shrink-0">{timeAgo(skill.last_updated)}</span>
        )}
      </div>
    </article>
  )
}
