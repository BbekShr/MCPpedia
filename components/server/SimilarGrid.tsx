import Link from 'next/link'
import ServerIcon from '@/components/ServerIcon'
import type { Server, Tool } from '@/lib/types'
import { Icon, formatNumber, gradeColor } from './helpers'

type CardServer = Pick<
  Server,
  | 'id'
  | 'slug'
  | 'name'
  | 'tagline'
  | 'homepage_url'
  | 'author_github'
  | 'github_stars'
  | 'score_total'
  | 'tools'
>

export default function SimilarGrid({ servers }: { servers: CardServer[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      {servers.map(s => {
        const toolCount = (s.tools as Tool[] | undefined)?.length ?? 0
        const score = s.score_total || 0
        return (
          <Link
            key={s.id}
            href={`/s/${s.slug}`}
            className="block p-3 rounded-md bg-bg text-text-primary hover:bg-bg-secondary transition-colors"
            style={{ border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <ServerIcon name={s.name} homepageUrl={s.homepage_url} authorGithub={s.author_github} size={22} />
              <span className="text-[13px] font-semibold truncate flex-1 min-w-0">{s.name}</span>
              <span className="text-[11px] font-bold shrink-0" style={{ color: gradeColor(score) }}>
                {score}
              </span>
            </div>
            {s.tagline && (
              <p
                className="m-0 text-xs text-text-muted leading-snug overflow-hidden"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {s.tagline}
              </p>
            )}
            <div className="flex gap-2.5 text-[11px] text-text-muted mt-1.5">
              {s.github_stars > 0 && (
                <span className="inline-flex gap-1 items-center">
                  <Icon name="star" size={10} /> {formatNumber(s.github_stars)}
                </span>
              )}
              {toolCount > 0 && (
                <span className="inline-flex gap-1 items-center">
                  <Icon name="wrench" size={10} /> {toolCount}
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
