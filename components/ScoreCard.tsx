'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import { SCORE_WEIGHTS } from '@/lib/scoring'

function ScoreBar({ label, score, max, children }: {
  label: string
  score: number
  max: number
  children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const pct = Math.round((score / max) * 100)
  const filled = Math.round((score / max) * 10)

  let color = 'bg-green'
  if (pct < 40) color = 'bg-red'
  else if (pct < 70) color = 'bg-yellow'

  return (
    <div>
      <button
        onClick={() => children && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 text-sm ${children ? 'cursor-pointer hover:bg-bg-secondary -mx-1 px-1 rounded' : ''}`}
      >
        <span className="w-28 text-text-muted shrink-0 text-left">{label}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm ${i < filled ? color : 'bg-border'}`}
              />
            ))}
          </div>
          <span className="text-xs text-text-muted w-12 text-right">{score}/{max}</span>
        </div>
        {children && (
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {expanded && children && (
        <div className="ml-[7.5rem] mt-1 mb-2 pl-3 border-l-2 border-border text-xs space-y-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

function Evidence({ pass, text, link, linkText }: {
  pass: boolean | null
  text: string
  link?: string
  linkText?: string
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className={pass === true ? 'text-green' : pass === false ? 'text-red' : 'text-text-muted'}>
        {pass === true ? '✓' : pass === false ? '✗' : '○'}
      </span>
      <span className="text-text-muted">
        {text}
        {link && (
          <>
            {' '}
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
              {linkText || 'verify →'}
            </a>
          </>
        )}
      </span>
    </div>
  )
}

function timeAgo(date: string): string {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'

  const strokeColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--accent)' : score >= 40 ? 'var(--yellow)' : 'var(--red)'
  const gradeColor = score >= 80 ? 'text-green' : score >= 60 ? 'text-accent' : score >= 40 ? 'text-yellow' : 'text-red'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={strokeColor} strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-bold ${gradeColor}`}>{score}</span>
        <span className={`text-[10px] font-semibold ${gradeColor} -mt-0.5`}>{grade}</span>
      </div>
    </div>
  )
}

export default function ScoreCard({ server }: { server: Server }) {
  const total = Math.min(server.score_total || 0, 100)
  const toolCount = server.tools?.length || 0
  const tokenCost = server.total_tool_tokens || toolCount * 150
  const daysSinceCommit = server.github_last_commit
    ? Math.floor((Date.now() - new Date(server.github_last_commit).getTime()) / 86400000)
    : null

  const osvLink = server.npm_package
    ? `https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(server.npm_package)}`
    : server.pip_package
      ? `https://osv.dev/list?ecosystem=PyPI&q=${encodeURIComponent(server.pip_package)}`
      : null

  return (
    <div className="border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-text-primary">MCPpedia Score</h3>
          <p className="text-xs text-text-muted">Click each category to see evidence</p>
        </div>
        <ScoreRing score={total} />
      </div>

      <div className="space-y-1">
        {/* Security */}
        <ScoreBar label="Security" score={Math.min(server.score_security || 0, SCORE_WEIGHTS.security)} max={SCORE_WEIGHTS.security}>
          <Evidence
            pass={server.cve_count === 0}
            text={server.cve_count === 0 ? 'No known CVEs' : `${server.cve_count} CVE(s) found`}
            link={osvLink || undefined}
            linkText="check OSV.dev →"
          />
          <Evidence
            pass={server.has_authentication}
            text={server.has_authentication ? 'Has authentication' : 'No authentication'}
          />
          <Evidence
            pass={!!server.license}
            text={server.license ? `License: ${server.license}` : 'No license specified'}
            link={server.github_url ? `${server.github_url}/blob/main/LICENSE` : undefined}
          />
          <Evidence
            pass={!server.is_archived}
            text={server.is_archived ? 'Repository archived' : 'Repository active'}
          />
          <Evidence
            pass={server.security_verified}
            text={server.security_verified ? 'MCPpedia security verified' : 'Not yet security verified'}
          />
        </ScoreBar>

        {/* Maintenance */}
        <ScoreBar label="Maintenance" score={Math.min(server.score_maintenance || 0, SCORE_WEIGHTS.maintenance)} max={SCORE_WEIGHTS.maintenance}>
          <Evidence
            pass={daysSinceCommit !== null && daysSinceCommit <= 30}
            text={daysSinceCommit !== null ? `Last commit: ${daysSinceCommit} days ago` : 'No commit data'}
            link={server.github_url ? `${server.github_url}/commits` : undefined}
            linkText="view commits →"
          />
          <Evidence
            pass={server.github_stars >= 100}
            text={`${server.github_stars.toLocaleString()} GitHub stars`}
            link={server.github_url || undefined}
            linkText="view repo →"
          />
          <Evidence
            pass={server.npm_weekly_downloads >= 100}
            text={server.npm_weekly_downloads > 0 ? `${server.npm_weekly_downloads.toLocaleString()} weekly downloads` : 'No npm download data'}
            link={server.npm_package ? `https://www.npmjs.com/package/${server.npm_package}` : undefined}
            linkText="view on npm →"
          />
          <Evidence
            pass={server.verified}
            text={server.verified ? 'MCPpedia verified' : 'Not yet verified'}
          />
        </ScoreBar>

        {/* Efficiency */}
        <ScoreBar label="Efficiency" score={Math.min(server.score_efficiency || 0, SCORE_WEIGHTS.efficiency)} max={SCORE_WEIGHTS.efficiency}>
          <Evidence
            pass={tokenCost <= 1500}
            text={`${toolCount} tools = ~${tokenCost.toLocaleString()} tokens of context`}
          />
          <Evidence
            pass={null}
            text={`${((tokenCost / 200000) * 100).toFixed(1)}% of a 200K context window`}
          />
          <Evidence
            pass={null}
            text={`Token efficiency grade: ${server.token_efficiency_grade || (tokenCost <= 500 ? 'A' : tokenCost <= 1500 ? 'B' : tokenCost <= 4000 ? 'C' : 'D')}`}
          />
        </ScoreBar>

        {/* Documentation */}
        <ScoreBar label="Documentation" score={Math.min(server.score_documentation || 0, SCORE_WEIGHTS.documentation)} max={SCORE_WEIGHTS.documentation}>
          <Evidence
            pass={!!server.description && server.description.length > 50}
            text={server.description ? 'Has description' : 'No description'}
          />
          <Evidence
            pass={toolCount > 0 && server.tools?.every(t => t.description?.length > 10)}
            text={toolCount > 0 ? `${server.tools?.filter(t => t.description?.length > 10).length}/${toolCount} tools documented` : 'No tools'}
          />
          <Evidence
            pass={Object.keys(server.install_configs || {}).length > 0}
            text={Object.keys(server.install_configs || {}).length > 0 ? 'Install config provided' : 'No install config'}
          />
          <Evidence
            pass={!!server.github_url}
            text={server.github_url ? 'Has README on GitHub' : 'No GitHub link'}
            link={server.github_url || undefined}
            linkText="read README →"
          />
        </ScoreBar>

        {/* Compatibility */}
        <ScoreBar label="Compatibility" score={Math.min(server.score_compatibility || 0, SCORE_WEIGHTS.compatibility)} max={SCORE_WEIGHTS.compatibility}>
          <Evidence
            pass={server.transport?.includes('stdio')}
            text={server.transport?.includes('stdio') ? 'Supports stdio (local)' : 'No stdio support'}
          />
          <Evidence
            pass={server.transport?.includes('http') || server.transport?.includes('sse')}
            text={server.transport?.includes('http') || server.transport?.includes('sse') ? 'Supports HTTP/SSE (remote)' : 'No HTTP/SSE support'}
          />
          <Evidence
            pass={(server.transport?.length || 0) > 1}
            text={`${server.transport?.length || 0} transport(s): ${server.transport?.join(', ') || 'none'}`}
          />
        </ScoreBar>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        {server.score_computed_at && (
          <p className="text-xs text-text-muted">
            Scored {timeAgo(server.score_computed_at)}
          </p>
        )}
        <Link href="/methodology" className="text-xs text-accent hover:text-accent-hover">
          How we score →
        </Link>
      </div>
    </div>
  )
}
