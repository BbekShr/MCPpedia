/**
 * ServerCardMini — inline card for server mentions in blog posts.
 * Use in MDX: <ServerCardMini slug="supabase" score={97} tools={108} cves={0} />
 */

import Link from 'next/link'

interface Props {
  slug: string
  name?: string
  score?: number
  tools?: number
  cves?: number
  transport?: string
}

function scoreGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

function badgeStyles(score: number): string {
  if (score >= 80) return 'bg-green/10 text-green border-green/20'
  if (score >= 60) return 'bg-accent/10 text-accent border-accent/20'
  if (score >= 40) return 'bg-yellow/10 text-yellow border-yellow/20'
  return 'bg-red/10 text-red border-red/20'
}

export default function ServerCardMini({ slug, name, score, tools, cves, transport }: Props) {
  const displayName = name || slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const grade = score ? scoreGrade(score) : null

  return (
    <Link
      href={`/s/${slug}`}
      className="not-prose flex items-center gap-3 my-4 p-3 rounded-lg border border-border bg-bg hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px] transition-all duration-150 no-underline"
    >
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm text-text-primary">{displayName}</span>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
          {tools !== undefined && <span>{tools} tools</span>}
          {transport && <span>{transport}</span>}
          {cves !== undefined && (
            <span className={cves === 0 ? 'text-green' : 'text-red'}>
              {cves === 0 ? 'No CVEs' : `${cves} CVEs`}
            </span>
          )}
        </div>
      </div>
      {score !== undefined && score > 0 && (
        <span className={`text-xs font-bold px-2 py-1 rounded border ${badgeStyles(score)}`}>
          {score} {grade}
        </span>
      )}
      <span className="text-xs text-accent font-medium shrink-0">View &rarr;</span>
    </Link>
  )
}
