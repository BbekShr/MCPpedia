import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ScoreBadge from './ScoreBadge'
import type { Server } from '@/lib/types'

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default async function TrendingWidget() {
  const supabase = await createClient()

  // "Trending" = high downloads + recently updated + high score
  // We pick servers with recent commits, high downloads, sorted by weekly downloads
  const { data: trending } = await supabase
    .from('servers')
    .select('slug, name, score_total, npm_weekly_downloads, github_stars, github_last_commit, tagline')
    .eq('is_archived', false)
    .gt('score_total', 50)
    .gt('npm_weekly_downloads', 100)
    .order('npm_weekly_downloads', { ascending: false })
    .limit(5)

  if (!trending || trending.length === 0) return null

  return (
    <section className="border-t border-border">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              Trending this week
            </h2>
            <p className="text-xs text-text-muted">Most downloaded servers with high MCPpedia scores</p>
          </div>
          <Link href="/servers?sort=downloads" className="text-sm text-accent hover:text-accent-hover">
            View all &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {(trending as Server[]).map((server, i) => (
            <Link
              key={server.slug}
              href={`/s/${server.slug}`}
              className="border border-border rounded-md p-3 bg-bg hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-[1px] transition-all duration-150"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-text-muted">#{i + 1}</span>
                {server.score_total > 0 && (
                  <ScoreBadge score={server.score_total} size="sm" showGrade={false} />
                )}
              </div>
              <h3 className="font-semibold text-sm text-text-primary truncate mb-0.5">{server.name}</h3>
              {server.tagline && (
                <p className="text-xs text-text-muted line-clamp-1 mb-2">{server.tagline}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-text-muted">
                {server.npm_weekly_downloads > 0 && (
                  <span className="flex items-center gap-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    {formatNumber(server.npm_weekly_downloads)}/wk
                  </span>
                )}
                {server.github_stars > 0 && (
                  <span className="flex items-center gap-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    {formatNumber(server.github_stars)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
