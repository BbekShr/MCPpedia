'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Server, SecurityAdvisory } from '@/lib/types'
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

function Evidence({ pass, text, pts, link, linkText }: {
  pass: boolean | null
  text: string
  pts?: string
  link?: string
  linkText?: string
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className={pass === true ? 'text-green' : pass === false ? 'text-red' : 'text-text-muted'}>
        {pass === true ? '✓' : pass === false ? '✗' : '○'}
      </span>
      <span className="text-text-muted flex-1">
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
      {pts && <span className="text-text-muted shrink-0 tabular-nums">{pts}</span>}
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

function commitPassState(days: number | null): boolean | null {
  if (days === null) return false
  if (days <= 30) return true
  if (days <= 180) return null // neutral — still gets points
  return false
}

function commitPts(days: number | null): string {
  if (days === null) return '+0'
  if (days <= 7) return '+12'
  if (days <= 30) return '+10'
  if (days <= 90) return '+7'
  if (days <= 180) return '+4'
  if (days <= 365) return '+2'
  return '+0'
}

function efficiencyGrade(tokens: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (tokens <= 500) return 'A'
  if (tokens <= 1500) return 'B'
  if (tokens <= 4000) return 'C'
  if (tokens <= 8000) return 'D'
  return 'F'
}

export default function ScoreCard({ server, advisories = [] }: { server: Server; advisories?: SecurityAdvisory[] }) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const res = await fetch(`/api/server/${server.slug}/refresh-score`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to refresh')
      const data = await res.json()
      setRefreshResult(`Score updated: ${data.score_total}/100`)
      // Reload page after short delay to show fresh data
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setRefreshResult('Refresh failed — try again later')
    } finally {
      setRefreshing(false)
    }
  }

  const openCVEs = advisories.filter(a => a.status === 'open').length
  const subcategorySum = (server.score_security || 0) + (server.score_maintenance || 0) + (server.score_efficiency || 0) + (server.score_documentation || 0) + (server.score_compatibility || 0)
  const total = Math.min(subcategorySum || server.score_total || 0, 100)
  const toolCount = server.tools?.length || 0
  const tokenCost = server.total_tool_tokens || 0
  const hasTokenData = (server.total_tool_tokens || 0) > 0
  const daysSinceCommit = server.github_last_commit
    ? Math.floor((Date.now() - new Date(server.github_last_commit).getTime()) / 86400000)
    : null
  const grade = server.token_efficiency_grade || (hasTokenData ? efficiencyGrade(tokenCost) : 'unknown')

  const osvLink = server.npm_package
    ? `https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(server.npm_package)}`
    : server.pip_package
      ? `https://osv.dev/list?ecosystem=PyPI&q=${encodeURIComponent(server.pip_package)}`
      : null

  // Documentation evidence (computed client-side from available data)
  const toolsDocumented = server.tools?.filter(t => t.description?.length > 10).length || 0
  const toolsWithSchemas = server.tools?.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0).length || 0
  const hasInstallConfig = Object.keys(server.install_configs || {}).length > 0
  const hasTagline = !!server.tagline
  const hasApiName = !!server.api_name
  const hasHomepage = !!server.homepage_url

  // Compatibility
  const supportsStdio = server.transport?.includes('stdio') || false
  const supportsHttp = server.transport?.includes('http') || server.transport?.includes('sse') || false
  const hasMultipleTransports = (server.transport?.length || 0) > 1
  const clientCount = server.compatible_clients?.length || 0
  const hasTransportData = (server.transport?.length || 0) > 0

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
        {/* Security (0-30) */}
        <ScoreBar label="Security" score={Math.min(server.score_security || 0, SCORE_WEIGHTS.security)} max={SCORE_WEIGHTS.security}>
          <Evidence
            pass={openCVEs === 0}
            text={openCVEs === 0 ? 'No known CVEs' : `${openCVEs} CVE(s) found`}
            pts={openCVEs === 0 ? '' : `-${openCVEs * 10}`}
            link={osvLink || undefined}
            linkText="check OSV.dev →"
          />
          <Evidence
            pass={null}
            text={server.has_authentication ? 'Has authentication' : 'No authentication required'}
          />
          <Evidence
            pass={!!server.license && server.license !== 'NOASSERTION'}
            text={server.license && server.license !== 'NOASSERTION' ? `License: ${server.license}` : 'No license specified'}
            pts={server.license && server.license !== 'NOASSERTION' ? '' : '-3'}
            link={server.github_url ? `${server.github_url}/blob/main/LICENSE` : undefined}
          />
          <Evidence
            pass={!server.is_archived}
            text={server.is_archived ? 'Repository archived' : 'Repository active'}
            pts={server.is_archived ? '-8' : ''}
          />
          <Evidence
            pass={server.security_verified}
            text={server.security_verified ? 'MCPpedia security verified' : 'Not yet security verified'}
            pts={server.security_verified ? '+5' : ''}
          />
        </ScoreBar>

        {/* Maintenance (0-25) */}
        <ScoreBar label="Maintenance" score={Math.min(server.score_maintenance || 0, SCORE_WEIGHTS.maintenance)} max={SCORE_WEIGHTS.maintenance}>
          <Evidence
            pass={commitPassState(daysSinceCommit)}
            text={daysSinceCommit !== null ? `Last commit: ${daysSinceCommit} days ago` : 'No commit data'}
            pts={commitPts(daysSinceCommit)}
            link={server.github_url ? `${server.github_url}/commits` : undefined}
            linkText="view commits →"
          />
          <Evidence
            pass={server.github_stars >= 100}
            text={`${server.github_stars.toLocaleString()} GitHub stars`}
            pts={server.github_stars >= 5000 ? '+5' : server.github_stars >= 1000 ? '+4' : server.github_stars >= 100 ? '+3' : server.github_stars >= 10 ? '+1' : '+0'}
            link={server.github_url || undefined}
            linkText="view repo →"
          />
          <Evidence
            pass={server.npm_weekly_downloads >= 100}
            text={server.npm_weekly_downloads > 0 ? `${server.npm_weekly_downloads.toLocaleString()} weekly downloads` : 'No npm download data'}
            pts={server.npm_weekly_downloads >= 10000 ? '+5' : server.npm_weekly_downloads >= 1000 ? '+4' : server.npm_weekly_downloads >= 100 ? '+2' : '+0'}
            link={server.npm_package ? `https://www.npmjs.com/package/${server.npm_package}` : undefined}
            linkText="view on npm →"
          />
          {(server.github_open_issues || 0) > 50 && (
            <Evidence
              pass={false}
              text={`${server.github_open_issues} open issues`}
              pts={(server.github_open_issues || 0) > 100 ? '-2' : '-1'}
            />
          )}
          <Evidence
            pass={server.verified}
            text={server.verified ? 'MCPpedia verified' : 'Not yet verified'}
            pts={server.verified ? '+3' : ''}
          />
        </ScoreBar>

        {/* Efficiency (0-20) */}
        <ScoreBar label="Efficiency" score={Math.min(server.score_efficiency || 0, SCORE_WEIGHTS.efficiency)} max={SCORE_WEIGHTS.efficiency}>
          {hasTokenData ? (
            <>
              <Evidence
                pass={tokenCost <= 4000}
                text={`${toolCount} tools = ~${tokenCost.toLocaleString()} tokens of context`}
                pts={tokenCost <= 500 ? '+20' : tokenCost <= 1500 ? '+16' : tokenCost <= 4000 ? '+12' : tokenCost <= 8000 ? '+6' : '+2'}
              />
              <Evidence
                pass={null}
                text={`${((tokenCost / 200000) * 100).toFixed(1)}% of a 200K context window`}
              />
              <Evidence
                pass={null}
                text={`Token efficiency grade: ${grade}`}
              />
            </>
          ) : (
            <Evidence
              pass={null}
              text={`${toolCount} tools — token cost not yet measured`}
            />
          )}
        </ScoreBar>

        {/* Documentation (0-15) */}
        <ScoreBar label="Documentation" score={Math.min(server.score_documentation || 0, SCORE_WEIGHTS.documentation)} max={SCORE_WEIGHTS.documentation}>
          <Evidence
            pass={!!server.description && server.description.length > 50}
            text={server.description && server.description.length > 50 ? 'Has description' : 'No description (>50 chars)'}
            pts={server.description && server.description.length > 50 ? '+2' : '+0'}
          />
          <Evidence
            pass={null}
            text={`Metadata: ${[hasTagline && 'tagline', server.github_url && 'repo', hasHomepage && 'homepage', hasApiName && 'API name'].filter(Boolean).join(', ') || 'none'}`}
            pts={`+${(hasTagline ? 1 : 0) + (server.github_url ? 1 : 0) + (hasHomepage ? 1 : 0) + (hasApiName ? 1 : 0)}`}
          />
          <Evidence
            pass={toolCount > 0 && toolsDocumented === toolCount}
            text={toolCount > 0
              ? `${toolsDocumented}/${toolCount} tools documented`
              : 'No tools'}
            pts={toolCount > 0
              ? (toolsDocumented === toolCount ? '+5' : toolsDocumented > toolCount * 0.5 ? '+3' : toolsDocumented > 0 ? '+1' : '+0')
              : '+0'}
          />
          {toolCount > 0 && (
            <Evidence
              pass={toolsWithSchemas > toolCount * 0.5}
              text={`${toolsWithSchemas}/${toolCount} tools have input schemas`}
              pts={toolsWithSchemas > toolCount * 0.5 ? '+3' : '+0'}
            />
          )}
          <Evidence
            pass={hasInstallConfig}
            text={hasInstallConfig ? 'Install config provided' : 'No install config'}
            pts={hasInstallConfig ? '+3' : '+0'}
          />
          {server.doc_readme_quality ? (
            <>
              <Evidence
                pass={server.doc_readme_quality === 'excellent' || server.doc_readme_quality === 'good'}
                text={`README quality: ${server.doc_readme_quality}`}
                pts={server.doc_readme_quality === 'excellent' ? '+3' : server.doc_readme_quality === 'good' ? '+2' : server.doc_readme_quality === 'basic' ? '+1' : '+0'}
              />
              <Evidence
                pass={server.doc_has_setup}
                text={server.doc_has_setup ? 'README has setup instructions' : 'No setup instructions in README'}
                pts={server.doc_has_setup ? '+2' : '+0'}
              />
              <Evidence
                pass={server.doc_has_examples}
                text={server.doc_has_examples ? 'README has examples' : 'No examples in README'}
                pts={server.doc_has_examples ? '+2' : '+0'}
              />
            </>
          ) : (
            <Evidence
              pass={!!server.github_url}
              text={server.github_url ? 'Has README on GitHub' : 'No GitHub link'}
              link={server.github_url || undefined}
              linkText="read README →"
            />
          )}
        </ScoreBar>

        {/* Compatibility (0-10) */}
        <ScoreBar label="Compatibility" score={Math.min(server.score_compatibility || 0, SCORE_WEIGHTS.compatibility)} max={SCORE_WEIGHTS.compatibility}>
          {hasTransportData ? (
            <>
              <Evidence
                pass={supportsStdio}
                text={supportsStdio ? 'Supports stdio (local)' : 'No stdio support'}
                pts={supportsStdio ? '+4' : '+0'}
              />
              <Evidence
                pass={supportsHttp}
                text={supportsHttp ? 'Supports HTTP/SSE (remote)' : 'No HTTP/SSE support'}
                pts={supportsHttp ? '+4' : '+0'}
              />
              {hasMultipleTransports && (
                <Evidence pass={true} text="Multiple transports" pts="+2" />
              )}
              {clientCount > 0 && (
                <Evidence
                  pass={true}
                  text={`${clientCount} tested client(s): ${server.compatible_clients?.join(', ')}`}
                  pts={`+${Math.min(clientCount * 2, 6)}`}
                />
              )}
            </>
          ) : (
            <Evidence
              pass={null}
              text="No transport data available"
            />
          )}
        </ScoreBar>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-3">
          {server.score_computed_at && (
            <p className="text-xs text-text-muted">
              Scored {timeAgo(server.score_computed_at)}
            </p>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs text-accent hover:text-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? 'Refreshing...' : 'Refresh score'}
          </button>
          {refreshResult && (
            <span className={`text-xs ${refreshResult.includes('failed') ? 'text-red' : 'text-green'}`}>
              {refreshResult}
            </span>
          )}
        </div>
        <Link href="/methodology" className="text-xs text-accent hover:text-accent-hover">
          How we score →
        </Link>
      </div>
    </div>
  )
}
