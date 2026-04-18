import Link from 'next/link'
import ServerIcon from '@/components/ServerIcon'
import VerifiedBadge from '@/components/VerifiedBadge'
import type { Server, SecurityAdvisory } from '@/lib/types'
import { Chip, Icon, ScoreRing, daysSince, formatNumber } from './helpers'

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function Verdict({ server, advisories }: { server: Server; advisories: SecurityAdvisory[] }) {
  const openCVEs = advisories.filter(a => a.status === 'open').length
  const commitDays = daysSince(server.github_last_commit)
  const clientCount = server.compatible_clients?.length ?? 0
  const toolCount = server.tools?.length ?? 0
  const tokens = server.total_tool_tokens ?? 0
  const grade = server.token_efficiency_grade

  const items = [
    {
      key: 'safe',
      label: openCVEs === 0 ? 'No known CVEs' : `${openCVEs} open CVE${openCVEs !== 1 ? 's' : ''}`,
      tone: openCVEs === 0 ? 'green' : 'red',
      icon: openCVEs === 0 ? ('check' as const) : ('alert' as const),
      detail: server.license && server.license !== 'NOASSERTION' ? `${server.license} license` : 'No license',
    },
    {
      key: 'maintained',
      label:
        commitDays === null
          ? 'Maintenance unknown'
          : commitDays < 30
            ? 'Actively maintained'
            : commitDays < 180
              ? 'Maintained'
              : 'Stale',
      tone:
        commitDays === null
          ? 'neutral'
          : commitDays < 30
            ? 'green'
            : commitDays < 180
              ? 'yellow'
              : 'red',
      icon: commitDays !== null && commitDays < 30 ? ('check' as const) : ('clock' as const),
      detail: commitDays !== null ? `Last commit ${commitDays}d ago` : 'No commit data',
    },
    {
      key: 'compatible',
      label:
        clientCount >= 3
          ? 'Works with most clients'
          : clientCount > 0
            ? `Works with ${clientCount}`
            : 'Untested',
      tone: clientCount >= 3 ? 'green' : clientCount > 0 ? 'yellow' : 'neutral',
      icon: clientCount > 0 ? ('check' as const) : ('clock' as const),
      detail: `Transport: ${server.transport?.length ? server.transport.join(', ') : 'unknown'}`,
    },
    {
      key: 'efficient',
      label: `${toolCount} tool${toolCount !== 1 ? 's' : ''}${tokens ? ` · ~${formatNumber(tokens)} tok` : ''}`,
      tone: grade === 'A' || grade === 'B' ? 'green' : grade === 'C' ? 'yellow' : grade === 'unknown' ? 'neutral' : 'red',
      icon: 'gauge' as const,
      detail: grade && grade !== 'unknown'
        ? `Grade ${grade}${tokens ? ` · ${((tokens / 200000) * 100).toFixed(1)}% of 200K ctx` : ''}`
        : 'Token cost not measured',
    },
  ] as const

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map(it => {
        const color = {
          green: 'var(--green)',
          red: 'var(--red)',
          yellow: 'var(--yellow)',
          neutral: 'var(--text-muted)',
        }[it.tone]
        return (
          <div
            key={it.key}
            className="min-w-0 p-2.5 rounded-md bg-bg flex flex-col gap-0.5"
            style={{ border: '1px solid var(--border)', borderTop: `2px solid ${color}` }}
          >
            <div
              className="flex items-center gap-1.5 text-[12.5px] font-semibold min-w-0"
              style={{ color }}
            >
              <Icon name={it.icon} size={13} />
              <span className="truncate">{it.label}</span>
            </div>
            <div className="text-[11.5px] text-text-muted truncate">{it.detail}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Hero({
  server,
  advisories,
}: {
  server: Server
  advisories: SecurityAdvisory[]
}) {
  const s = server
  const score = s.score_total || 0
  const primaryCategory = s.categories?.[0]
  const tagline = s.tagline ? stripHtml(s.tagline) : null

  return (
    <section className="border-b border-border" style={{ background: 'var(--hero-gradient)' }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 pt-5 pb-5">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[12.5px] text-text-muted mb-3.5 flex-wrap"
        >
          <Link href="/">Home</Link>
          <span className="opacity-50">/</span>
          <Link href="/servers">Servers</Link>
          {primaryCategory && (
            <>
              <span className="opacity-50">/</span>
              <Link href={`/category/${encodeURIComponent(primaryCategory)}`}>{primaryCategory}</Link>
            </>
          )}
          <span className="opacity-50">/</span>
          <span className="text-text-primary font-medium truncate max-w-[280px]">{s.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-7 items-start">
          {/* left — identity + verdict */}
          <div className="min-w-0">
            <div className="flex items-start gap-3 mb-2.5">
              <ServerIcon name={s.name} homepageUrl={s.homepage_url} authorGithub={s.author_github} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-text-primary break-words">
                    {s.name}
                  </h1>
                  {s.author_type === 'official' && <Chip tone="accent" size="md">Official</Chip>}
                  {s.verified && <VerifiedBadge type="mcppedia" />}
                  {s.publisher_verified && <VerifiedBadge type="publisher" />}
                  {s.registry_verified && <VerifiedBadge type="registry" />}
                </div>
                <div className="font-mono text-[11.5px] text-text-muted mt-1 break-all">
                  {[
                    s.npm_package || s.pip_package,
                    s.author_name ? `by ${s.author_name}` : s.author_github ? `by ${s.author_github}` : null,
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </div>
                {tagline && (
                  <p className="mt-2 text-[14.5px] text-text-primary max-w-[640px] leading-snug">{tagline}</p>
                )}
              </div>
            </div>

            {/* stats row */}
            <div className="flex gap-4 flex-wrap text-[12.5px] text-text-muted mb-3.5">
              {s.github_stars > 0 && (
                <span className="inline-flex gap-1 items-center">
                  <Icon name="star" size={12} /> {formatNumber(s.github_stars)}
                </span>
              )}
              {s.npm_weekly_downloads > 0 && (
                <span className="inline-flex gap-1 items-center">
                  <Icon name="download" size={12} /> {formatNumber(s.npm_weekly_downloads)}/wk
                </span>
              )}
              <span className="inline-flex gap-1 items-center">
                <Icon name="wrench" size={12} /> {s.tools?.length ?? 0} tool{(s.tools?.length ?? 0) !== 1 ? 's' : ''}
              </span>
              {s.github_url && (
                <a
                  href={s.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex gap-1 items-center hover:text-text-primary"
                >
                  <Icon name="gitBranch" size={12} /> GitHub <Icon name="external" size={10} />
                </a>
              )}
              {s.npm_package && (
                <a
                  href={`https://www.npmjs.com/package/${s.npm_package}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex gap-1 items-center hover:text-text-primary"
                >
                  <Icon name="package" size={12} /> npm <Icon name="external" size={10} />
                </a>
              )}
              {s.pip_package && (
                <a
                  href={`https://pypi.org/project/${s.pip_package}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex gap-1 items-center hover:text-text-primary"
                >
                  <Icon name="package" size={12} /> PyPI <Icon name="external" size={10} />
                </a>
              )}
              {s.community_verification_count > 0 && (
                <span className="inline-flex gap-1 items-center">
                  <Icon name="heart" size={12} /> {s.community_verification_count} confirmed install
                  {s.community_verification_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <Verdict server={s} advisories={advisories} />
          </div>

          {/* right — score + primary CTA stacked */}
          <aside className="flex flex-col gap-3 items-stretch w-full md:w-60">
            <div
              className="p-3.5 flex flex-col gap-2.5 items-center rounded-lg bg-bg"
              style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                MCPpedia Score
              </div>
              <ScoreRing score={score} />
              <a href="#score" className="text-[11.5px] text-accent hover:text-accent-hover">
                See breakdown →
              </a>
            </div>
            <a
              href="#install"
              className="w-full px-3.5 py-2.5 rounded-md font-semibold text-sm inline-flex items-center justify-center gap-2 text-accent-fg"
              style={{
                background: 'var(--accent)',
                border: '1px solid var(--accent)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Icon name="download" size={15} /> Install &amp; copy config
            </a>
          </aside>
        </div>
      </div>
    </section>
  )
}
