import Link from 'next/link'
import ServerIcon from '@/components/ServerIcon'
import { formatNumber, grade, gradeColor, Icon, SectionHeader, stripTagline } from './helpers'

export interface FeaturedServer {
  slug: string
  name: string
  tagline: string | null
  homepage_url: string | null
  author_name: string | null
  author_github: string | null
  author_type: 'official' | 'community' | 'unknown'
  score_total: number
  github_stars: number
  npm_weekly_downloads: number
  transport: string[]
}

function FeaturedCard({ server, highlight }: { server: FeaturedServer; highlight?: string }) {
  const score = server.score_total || 0
  const color = gradeColor(score)
  const tagline = stripTagline(server.tagline)
  const publisher = server.author_name || server.author_github || 'unknown'

  return (
    <Link
      href={`/s/${server.slug}`}
      className="hover-lift flex flex-col relative overflow-hidden rounded-lg bg-bg text-text-primary"
      style={{
        padding: 'var(--card-pad)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        className="absolute top-0 right-0 font-mono font-bold text-white"
        style={{
          padding: '4px 10px',
          background: color,
          fontSize: 11.5,
          letterSpacing: '0.04em',
          borderRadius: '0 8px 0 8px',
        }}
      >
        {score} · {grade(score)}
      </div>

      <div className="flex items-center gap-2.5 mb-2 pr-20">
        <ServerIcon name={server.name} homepageUrl={server.homepage_url} authorGithub={server.author_github} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold tracking-tight truncate">{server.name}</div>
          <div className="text-[11.5px] text-text-muted flex items-center gap-1 min-w-0">
            {server.author_type === 'official' && <Icon name="verified" size={11} />}
            <span className="truncate">{publisher}</span>
          </div>
        </div>
      </div>

      {tagline && (
        <p className="m-0 mb-3 text-[13.5px] text-text-primary" style={{ lineHeight: 1.5, textWrap: 'pretty' }}>
          {tagline}
        </p>
      )}

      {highlight && (
        <div
          className="mt-auto rounded-md flex items-center gap-1.5 px-2.5 py-2 text-xs text-text-muted"
          style={{
            background: 'var(--bg-secondary)',
            borderLeft: '2px solid var(--green)',
          }}
        >
          <span className="shrink-0" style={{ color: 'var(--green)' }}>
            <Icon name="check" size={11} />
          </span>
          <span>
            <b className="text-text-primary font-medium">Why this:</b> {highlight}
          </span>
        </div>
      )}

      <div className="mt-3 flex gap-3.5 text-[11.5px] text-text-muted items-center">
        {server.github_stars > 0 && (
          <span className="inline-flex gap-1 items-center">
            <Icon name="star" size={11} /> {formatNumber(server.github_stars)}
          </span>
        )}
        {server.npm_weekly_downloads > 0 && (
          <span className="inline-flex gap-1 items-center">
            <Icon name="download" size={11} /> {formatNumber(server.npm_weekly_downloads)}/wk
          </span>
        )}
        {server.transport?.length > 0 && (
          <span className="font-mono uppercase text-[10.5px]">{server.transport.join(', ')}</span>
        )}
      </div>
    </Link>
  )
}

/** Pick a concise "why this" line from the server fields. */
function pickHighlight(s: FeaturedServer & { cve_count?: number; verified?: boolean }): string | undefined {
  const parts: string[] = []
  if ((s.cve_count ?? 0) === 0) parts.push('0 open CVEs')
  if (s.author_type === 'official') parts.push(`official ${s.author_name || s.author_github || 'publisher'}`)
  if (s.github_stars >= 1000) parts.push(`${formatNumber(s.github_stars)} GitHub stars`)
  if (!parts.length) return undefined
  return parts.slice(0, 2).join(' · ')
}

export default function Featured({
  servers,
}: {
  servers: (FeaturedServer & { cve_count?: number; verified?: boolean })[]
}) {
  return (
    <section style={{ padding: 'var(--section-pad) 0' }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <SectionHeader
          eyebrow="Editor's picks"
          title="Start here"
          desc="Three servers we recommend if you're new — highest-scored, well-documented, and actively maintained."
          right={
            <Link
              href="/servers?sort=score"
              className="text-[13px] text-accent inline-flex items-center gap-1"
            >
              See all A-graded <Icon name="chevronR" size={12} />
            </Link>
          }
        />
        <div
          className="grid grid-cols-1 md:grid-cols-3"
          style={{ gap: 'var(--grid-gap)' }}
        >
          {servers.map(s => (
            <FeaturedCard key={s.slug} server={s} highlight={pickHighlight(s)} />
          ))}
        </div>
      </div>
    </section>
  )
}
