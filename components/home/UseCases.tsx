import Link from 'next/link'
import ServerIcon from '@/components/ServerIcon'
import { Icon, SectionHeader } from './helpers'

/** The 6 use-cases surfaced on the home page. Keys mirror app/best-for/[usecase]. */
export const HOMEPAGE_USECASES: {
  id: string
  title: string
  subtitle: string
  accent: string
}[] = [
  {
    id: 'developers',
    title: 'Best for developers',
    subtitle: 'Code, review, and ship with confidence',
    accent: 'var(--cat-efficiency)',
  },
  {
    id: 'data-engineering',
    title: 'Best for data',
    subtitle: 'Query warehouses and databases safely',
    accent: 'var(--cat-security)',
  },
  {
    id: 'productivity',
    title: 'Best for productivity',
    subtitle: 'Slack, email, calendar, project management',
    accent: 'var(--accent)',
  },
  {
    id: 'ai-agents',
    title: 'Best for AI agents',
    subtitle: 'Memory, reasoning, browsing, orchestration',
    accent: 'var(--cat-documentation)',
  },
  {
    id: 'cloud-infrastructure',
    title: 'Best for cloud infra',
    subtitle: 'AWS, GCP, Azure, Docker, Kubernetes',
    accent: 'var(--cat-compatibility)',
  },
  {
    id: 'security',
    title: 'Best for security',
    subtitle: 'Vulnerability scanning and secrets management',
    accent: 'var(--cat-maintenance)',
  },
]

export interface UseCaseTileData {
  id: string
  title: string
  subtitle: string
  accent: string
  count: number
  top: { slug: string; name: string; homepage_url: string | null; author_github: string | null }[]
}

function Tile({ uc }: { uc: UseCaseTileData }) {
  return (
    <Link
      href={`/best-for/${uc.id}`}
      className="hover-lift block relative overflow-hidden rounded-lg bg-bg text-text-primary"
      style={{
        padding: 'var(--card-pad)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: uc.accent }}
      />

      <div className="flex items-start justify-between gap-2.5">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{uc.title}</div>
          <div className="text-[12.5px] text-text-muted mt-0.5">{uc.subtitle}</div>
        </div>
        <span
          className="font-mono font-semibold shrink-0"
          style={{
            padding: '2px 7px',
            borderRadius: 999,
            background: `color-mix(in srgb, ${uc.accent} 14%, transparent)`,
            color: uc.accent,
            fontSize: 11,
          }}
        >
          {uc.count}
        </span>
      </div>

      {uc.top.length > 0 && (
        <ol className="m-0 mt-3 p-0 list-none">
          {uc.top.map((s, i) => (
            <li
              key={s.slug}
              className="flex items-center gap-2 py-1.5 text-[13px]"
              style={{
                borderBottom:
                  i < uc.top.length - 1 ? '1px dashed var(--border-muted)' : 'none',
              }}
            >
              <span className="font-mono w-4 text-text-muted text-[11px]">{i + 1}.</span>
              <ServerIcon
                name={s.name}
                homepageUrl={s.homepage_url}
                authorGithub={s.author_github}
                size={20}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <Icon name="chevronR" size={12} />
            </li>
          ))}
        </ol>
      )}
    </Link>
  )
}

export default function UseCases({ tiles }: { tiles: UseCaseTileData[] }) {
  return (
    <section style={{ padding: 'var(--section-pad) 0' }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <SectionHeader
          eyebrow="By what you're doing"
          title="Browse by use case"
          desc="Curated shortlists. Each one shows the highest-scored option for the job."
        />
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: 'var(--grid-gap)' }}
        >
          {tiles.map(uc => (
            <Tile key={uc.id} uc={uc} />
          ))}
        </div>
      </div>
    </section>
  )
}
