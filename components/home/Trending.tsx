import Link from 'next/link'
import ServerIcon from '@/components/ServerIcon'
import { Chip, formatNumber, gradeColor, Icon, SectionHeader } from './helpers'

export interface TrendingRow {
  slug: string
  name: string
  author_name: string | null
  author_github: string | null
  author_type: 'official' | 'community' | 'unknown'
  homepage_url: string | null
  score_total: number
  npm_weekly_downloads: number
  categories: string[]
}

function Row({ row, rank }: { row: TrendingRow; rank: number }) {
  const score = row.score_total || 0
  const publisher = row.author_name || row.author_github || '—'
  const cat = row.categories?.[0]
  const rankColor = rank <= 3 ? 'var(--accent)' : 'var(--text-muted)'
  const rankWeight = rank <= 3 ? 700 : 500
  return (
    <Link
      href={`/s/${row.slug}`}
      className="trend-row block text-text-primary"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      {/* Mobile layout */}
      <div className="flex md:hidden items-center gap-2 px-3 py-2.5 text-[13px]">
        <div
          className="font-mono w-6 shrink-0 text-xs text-center"
          style={{ color: rankColor, fontWeight: rankWeight }}
        >
          {rank}
        </div>
        <ServerIcon name={row.name} homepageUrl={row.homepage_url} authorGithub={row.author_github} size={24} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-text-primary truncate">{row.name}</div>
          <div className="text-[11.5px] text-text-muted flex items-center gap-1">
            {row.author_type === 'official' && <Icon name="verified" size={10} />}
            <span className="truncate">{publisher}</span>
          </div>
        </div>
        <div className="font-mono text-right shrink-0 text-[12px]" style={{ color: 'var(--text)' }}>
          {row.npm_weekly_downloads > 0 ? `${formatNumber(row.npm_weekly_downloads)}/wk` : '—'}
        </div>
      </div>

      {/* Desktop layout */}
      <div
        className="hidden md:grid gap-3 px-3 py-2.5 items-center text-[13px]"
        style={{ gridTemplateColumns: '28px 1.6fr 1fr 160px 120px' }}
      >
        <div className="font-mono" style={{ fontSize: 13, color: rankColor, fontWeight: rankWeight }}>
          {String(rank).padStart(2, '0')}
        </div>

        <div className="flex items-center gap-2.5 min-w-0">
          <ServerIcon name={row.name} homepageUrl={row.homepage_url} authorGithub={row.author_github} size={24} />
          <div className="min-w-0">
            <div className="font-medium text-text-primary truncate">{row.name}</div>
            <div className="text-[11.5px] text-text-muted flex items-center gap-1 min-w-0">
              {row.author_type === 'official' && <Icon name="verified" size={10} />}
              <span className="truncate">{publisher}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 text-xs">
          {cat && <Chip tone="neutral" size="sm">{cat}</Chip>}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-sm overflow-hidden"
            style={{ height: 6, background: 'var(--border-muted)' }}
          >
            <div
              style={{ width: `${score}%`, height: '100%', background: gradeColor(score), transition: 'width .4s' }}
            />
          </div>
          <span className="font-mono font-semibold text-right" style={{ fontSize: 12, color: gradeColor(score), minWidth: 26 }}>
            {score}
          </span>
        </div>

        <div className="font-mono text-right" style={{ fontSize: 12.5, color: 'var(--text)' }}>
          {row.npm_weekly_downloads > 0 ? formatNumber(row.npm_weekly_downloads) : '—'}
        </div>
      </div>
    </Link>
  )
}

export default function Trending({ rows }: { rows: TrendingRow[] }) {
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
          eyebrow="Leaderboard"
          title="Most installed this week"
          desc="Top 10 servers by npm weekly downloads."
        />

        {/* Mobile header */}
        <div
          className="flex md:hidden font-mono gap-2 px-3 py-2 text-[10.5px] uppercase tracking-widest text-text-muted font-medium"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="w-6">#</div>
          <div className="flex-1">Server</div>
          <div className="text-right">Installs/wk</div>
        </div>
        {/* Desktop header */}
        <div
          className="hidden md:grid font-mono gap-3 px-3 py-2 text-[10.5px] uppercase tracking-widest text-text-muted font-medium"
          style={{
            gridTemplateColumns: '28px 1.6fr 1fr 160px 120px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>#</div>
          <div>Server</div>
          <div>Category</div>
          <div>Score</div>
          <div className="text-right">Installs/wk</div>
        </div>

        <div
          className="overflow-hidden rounded-b-lg bg-bg"
          style={{ border: '1px solid var(--border)', borderTop: 'none' }}
        >
          {rows.map((r, i) => (
            <Row key={r.slug} row={r} rank={i + 1} />
          ))}
        </div>
      </div>
    </section>
  )
}
