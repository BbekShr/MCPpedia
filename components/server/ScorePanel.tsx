'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Server, SecurityEvidence } from '@/lib/types'
import { SCORE_WEIGHTS } from '@/lib/scoring'
import { daysSince, formatNumber } from './helpers'

type CategoryId = 'security' | 'maintenance' | 'efficiency' | 'documentation' | 'compatibility'

interface Factor {
  label: string
  delta: number
  max: number
  note: string
  link?: string
  linkText?: string
}

interface Category {
  id: CategoryId
  label: string
  val: number
  max: number
  color: string
  subtitle: string
}

function buildFactors(id: CategoryId, server: Server): Factor[] {
  if (id === 'security') {
    if (server.security_evidence && server.security_evidence.length > 0) {
      return (server.security_evidence as SecurityEvidence[]).map(e => ({
        label: e.label,
        delta: Math.max(0, e.points),
        max: e.max_points,
        note: e.detail,
        link: e.link,
        linkText: e.link_text,
      }))
    }
    // Fallback without scoring engine data
    const cves = server.cve_count || 0
    return [
      {
        label: 'No known CVEs',
        max: 20,
        delta: cves === 0 ? 20 : Math.max(0, 20 - cves * 6),
        note: cves === 0 ? 'No advisories filed' : `${cves} open CVE${cves !== 1 ? 's' : ''}`,
      },
      {
        label: 'Auth & permissions model',
        max: 5,
        delta: server.has_authentication ? 4 : 5,
        note: server.has_authentication ? 'Requires API key — token-scope unclear' : 'Local-only, no credentials',
      },
      {
        label: 'License',
        max: 5,
        delta: server.license && server.license !== 'NOASSERTION' ? 5 : 0,
        note: server.license && server.license !== 'NOASSERTION' ? server.license : 'Not specified',
      },
    ]
  }
  if (id === 'maintenance') {
    const days = daysSince(server.github_last_commit)
    const commitPts = days === null ? 0 : days < 14 ? 10 : days < 45 ? 7 : days < 120 ? 4 : 1
    const issues = server.github_open_issues || 0
    const issuePts = issues < 20 ? 5 : issues < 60 ? 3 : 1
    const stars = server.github_stars || 0
    return [
      {
        label: 'Commit recency',
        max: 10,
        delta: commitPts,
        note: days !== null ? `Last commit ${days}d ago` : 'No commit data',
        link: server.github_url ? `${server.github_url}/commits` : undefined,
        linkText: 'view commits →',
      },
      {
        label: 'Community signal',
        max: 6,
        delta: stars >= 10000 ? 6 : stars >= 1000 ? 4 : stars >= 100 ? 3 : 1,
        note: `${formatNumber(stars)} GitHub stars${server.npm_weekly_downloads ? ` · ${formatNumber(server.npm_weekly_downloads)}/wk` : ''}`,
      },
      {
        label: 'Issue hygiene',
        max: 5,
        delta: issuePts,
        note: `${issues} open issue${issues !== 1 ? 's' : ''} on GitHub`,
      },
      {
        label: 'Verified',
        max: 4,
        delta: server.verified ? 4 : server.publisher_verified || server.registry_verified ? 2 : 0,
        note: server.verified
          ? 'MCPpedia verified'
          : server.registry_verified
            ? 'Registry verified'
            : 'Not verified',
      },
    ]
  }
  if (id === 'efficiency') {
    const tokens = server.total_tool_tokens || 0
    const tokenPts = tokens === 0 ? 0 : tokens < 1500 ? 10 : tokens < 2500 ? 7 : tokens < 4000 ? 4 : 2
    const toolCount = server.tools?.length || 0
    const countPts = toolCount === 0 ? 0 : toolCount <= 12 ? 5 : toolCount <= 20 ? 3 : 1
    const grade = server.token_efficiency_grade
    return [
      {
        label: 'Total tool-definition tokens',
        max: 10,
        delta: tokenPts,
        note: tokens ? `~${formatNumber(tokens)} tokens across ${toolCount} tool${toolCount !== 1 ? 's' : ''}` : 'Token cost not measured',
      },
      {
        label: 'Tool count discipline',
        max: 5,
        delta: countPts,
        note: `${toolCount} tool${toolCount !== 1 ? 's' : ''} exposed · ideal ≤ 12`,
      },
      {
        label: 'Schema conciseness',
        max: 5,
        delta: grade === 'A' ? 5 : grade === 'B' ? 4 : grade === 'C' ? 2 : grade === 'unknown' ? 0 : 1,
        note: grade && grade !== 'unknown' ? `Grade ${grade}` : 'Not graded',
      },
    ]
  }
  if (id === 'documentation') {
    const descLen = server.description?.length || 0
    const toolCount = server.tools?.length || 0
    const toolsDocumented = server.tools?.filter(t => t.description && t.description.length > 10).length || 0
    const toolsWithSchemas = server.tools?.filter(t => t.input_schema && Object.keys(t.input_schema).length > 0).length || 0
    const hasInstallConfig = Object.keys(server.install_configs || {}).length > 0
    return [
      {
        label: 'Server description',
        max: 4,
        delta: descLen > 120 ? 4 : descLen > 30 ? 2 : 0,
        note: descLen ? `${descLen} char description` : 'Missing description',
      },
      {
        label: 'Install instructions',
        max: 4,
        delta: hasInstallConfig ? 4 : 0,
        note: hasInstallConfig
          ? `${Object.keys(server.install_configs).length} client${Object.keys(server.install_configs).length !== 1 ? 's' : ''} with config`
          : 'No install config provided',
      },
      {
        label: 'Per-tool schemas',
        max: 4,
        delta: toolCount === 0 ? 0 : toolsWithSchemas === toolCount ? 4 : toolsWithSchemas > toolCount * 0.5 ? 2 : 1,
        note:
          toolCount > 0
            ? `${toolsWithSchemas}/${toolCount} tool${toolCount !== 1 ? 's' : ''} have input schemas`
            : 'No tools',
      },
      {
        label: 'Tool descriptions',
        max: 3,
        delta: toolCount === 0 ? 0 : toolsDocumented === toolCount ? 3 : toolsDocumented > toolCount * 0.5 ? 2 : 0,
        note:
          toolCount > 0
            ? `${toolsDocumented}/${toolCount} tool${toolCount !== 1 ? 's' : ''} documented`
            : 'No tools',
      },
    ]
  }
  // compatibility
  const clients = server.compatible_clients?.length || 0
  const transports = server.transport?.length || 0
  return [
    {
      label: 'Tested clients',
      max: 5,
      delta: clients >= 5 ? 5 : clients >= 3 ? 3 : clients >= 1 ? 2 : 0,
      note: clients > 0 ? `Verified on ${server.compatible_clients.join(', ')}` : 'No tested clients',
    },
    {
      label: 'Transport support',
      max: 3,
      delta: transports >= 2 ? 3 : transports === 1 ? 2 : 0,
      note: transports
        ? `${server.transport.join(', ')}${server.transport.includes('stdio') && !server.transport.includes('http') ? ' · remote-only clients unsupported' : ''}`
        : 'No transport data',
    },
    {
      label: 'Spec version',
      max: 2,
      delta: 2,
      note: 'MCP 2026-03 (latest)',
    },
  ]
}

function FactorCard({ factor, color }: { factor: Factor; color: string }) {
  const pct = factor.max > 0 ? Math.round((factor.delta / factor.max) * 100) : 0
  const isMax = factor.delta === factor.max && factor.max > 0
  const isZero = factor.delta === 0
  const barColor = isZero ? 'var(--red)' : isMax ? 'var(--green)' : color
  return (
    <div
      className="p-2.5 rounded-md bg-bg flex flex-col gap-1.5 min-w-0"
      style={{ border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-snug min-w-0 flex-1">{factor.label}</span>
        <span
          className="font-mono text-[11px] font-semibold whitespace-nowrap pt-px"
          style={{ color: barColor }}
        >
          +{factor.delta}
          <span className="font-medium text-text-muted opacity-55">/{factor.max}</span>
        </span>
      </div>
      <div className="h-1 bg-bg-tertiary rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm"
          style={{ width: `${pct}%`, background: barColor, transition: 'width 360ms ease' }}
        />
      </div>
      <span className="text-[11px] text-text-muted leading-snug">
        {factor.note}
        {factor.link && (
          <>
            {' '}
            <a
              href={factor.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              {factor.linkText || 'verify →'}
            </a>
          </>
        )}
      </span>
    </div>
  )
}

function Row({
  id,
  label,
  val,
  max,
  color,
  subtitle,
  expanded,
  onToggle,
  factors,
}: {
  id: CategoryId
  label: string
  val: number
  max: number
  color: string
  subtitle: string
  expanded: boolean
  onToggle: () => void
  factors: Factor[]
}) {
  const pct = Math.round((val / max) * 100)
  const factorSum = factors.reduce((s, f) => s + f.delta, 0)
  const factorMax = factors.reduce((s, f) => s + f.max, 0)
  return (
    <div
      className="rounded-md"
      style={{
        border: `1px solid ${expanded ? 'color-mix(in srgb, ' + color + ' 45%, var(--border))' : 'var(--border)'}`,
        background: expanded ? 'var(--bg-secondary)' : 'var(--bg)',
        transition: 'border-color 160ms, background 160ms',
        gridColumn: expanded ? '1 / -1' : 'auto',
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="w-full text-left bg-transparent border-0 cursor-pointer p-2.5 flex flex-col gap-1.5 text-text-primary"
      >
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-[12.5px] font-semibold flex items-center gap-1.5">
            {label}
            <span
              className="inline-block text-[9px] text-text-muted"
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            >
              ▶
            </span>
          </span>
          <span className="font-mono text-[11.5px] text-text-muted">
            {val}
            <span className="opacity-60">/{max}</span>
          </span>
        </div>
        <div className="h-1.5 bg-bg-tertiary rounded-sm overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${pct}%`, background: color, transition: 'width 500ms ease' }}
          />
        </div>
        <p className="m-0 text-[11.5px] text-text-muted leading-snug">{subtitle}</p>
      </button>

      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: '1px dashed var(--border)' }}>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">Evidence</span>
            <span className="font-mono text-[10.5px] text-text-muted whitespace-nowrap">
              {factorSum} / {factorMax} pts · {factors.length} factor{factors.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {factors.map((f, i) => (
              <FactorCard key={i} factor={f} color={color} />
            ))}
          </div>
          <div className="mt-2.5 text-[11.5px] text-text-muted">
            <Link href={`/methodology#${id}`} className="text-accent hover:text-accent-hover">
              Read the {label.toLowerCase()} methodology →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function StackedBar({ cats }: { cats: Category[] }) {
  const total = cats.reduce((s, c) => s + c.val, 0)
  const maxTotal = cats.reduce((s, c) => s + c.max, 0)
  return (
    <div>
      <div className="flex justify-between text-[10px] text-text-muted mb-1 font-mono">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
      <div
        className="flex h-7 rounded-md overflow-hidden bg-bg-tertiary"
        style={{ border: '1px solid var(--border)' }}
      >
        {cats.map(c => (
          <div
            key={c.id}
            title={`${c.label}: ${c.val}/${c.max} pts`}
            className="flex items-center justify-center text-white text-[11px] font-semibold tracking-wide"
            style={{
              width: `${c.val}%`,
              background: c.color,
              transition: 'width 600ms cubic-bezier(.2,.9,.2,1)',
            }}
          >
            {c.val >= 8 ? c.val : ''}
          </div>
        ))}
        {total < maxTotal && (
          <div
            className="flex items-center justify-center text-[10px] text-text-muted font-medium"
            title={`${maxTotal - total} points lost`}
            style={{
              width: `${maxTotal - total}%`,
              background:
                'repeating-linear-gradient(45deg, transparent 0 6px, color-mix(in srgb, var(--text-muted) 10%, transparent) 6px 12px)',
            }}
          >
            −{maxTotal - total}
          </div>
        )}
      </div>
      <div className="flex mt-1.5">
        {cats.map(c => (
          <div
            key={c.id}
            className="pr-1 min-w-0 pt-1.5"
            style={{ width: `${c.val}%`, borderTop: `2px solid ${c.color}` }}
          >
            <div className="text-[10.5px] text-text-muted font-medium uppercase tracking-wide truncate">
              {c.label}
            </div>
          </div>
        ))}
        {total < maxTotal && <div style={{ width: `${maxTotal - total}%` }} />}
      </div>
    </div>
  )
}

export default function ScorePanel({ server }: { server: Server }) {
  const [expanded, setExpanded] = useState<CategoryId | null>(null)

  const cats: Category[] = [
    {
      id: 'security',
      label: 'Security',
      val: Math.min(server.score_security || 0, SCORE_WEIGHTS.security),
      max: SCORE_WEIGHTS.security,
      color: 'var(--cat-security)',
      subtitle:
        server.cve_count === 0
          ? 'No known CVEs'
          : `${server.cve_count} open CVE${server.cve_count !== 1 ? 's' : ''}`,
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      val: Math.min(server.score_maintenance || 0, SCORE_WEIGHTS.maintenance),
      max: SCORE_WEIGHTS.maintenance,
      color: 'var(--cat-maintenance)',
      subtitle: (() => {
        const d = daysSince(server.github_last_commit)
        return `${d !== null ? `Last commit ${d}d ago` : 'No commit data'} · ${formatNumber(server.github_stars || 0)} star${(server.github_stars || 0) !== 1 ? 's' : ''}`
      })(),
    },
    {
      id: 'efficiency',
      label: 'Efficiency',
      val: Math.min(server.score_efficiency || 0, SCORE_WEIGHTS.efficiency),
      max: SCORE_WEIGHTS.efficiency,
      color: 'var(--cat-efficiency)',
      subtitle: `${server.tools?.length || 0} tool${(server.tools?.length || 0) !== 1 ? 's' : ''}${server.total_tool_tokens ? ` · ~${formatNumber(server.total_tool_tokens)} tokens` : ''}${server.token_efficiency_grade && server.token_efficiency_grade !== 'unknown' ? ` · Grade ${server.token_efficiency_grade}` : ''}`,
    },
    {
      id: 'documentation',
      label: 'Documentation',
      val: Math.min(server.score_documentation || 0, SCORE_WEIGHTS.documentation),
      max: SCORE_WEIGHTS.documentation,
      color: 'var(--cat-documentation)',
      subtitle: server.description ? 'Description, install config, tool schemas' : 'Missing description',
    },
    {
      id: 'compatibility',
      label: 'Compatibility',
      val: Math.min(server.score_compatibility || 0, SCORE_WEIGHTS.compatibility),
      max: SCORE_WEIGHTS.compatibility,
      color: 'var(--cat-compatibility)',
      subtitle: `${server.transport?.length ? server.transport.join(', ') : 'unknown'} · ${server.compatible_clients?.length || 'no'} tested client${(server.compatible_clients?.length || 0) !== 1 ? 's' : ''}`,
    },
  ]

  const total = cats.reduce((s, c) => s + c.val, 0)
  const maxTotal = cats.reduce((s, c) => s + c.max, 0)

  return (
    <div
      className="rounded-[10px] overflow-hidden bg-bg"
      style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Header */}
      <div
        className="flex items-end justify-between gap-4 px-4 pt-3.5 pb-3"
        style={{
          borderBottom: '1px solid var(--border-muted)',
          background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg) 100%)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] uppercase tracking-wider text-text-muted font-semibold mb-0.5">
            Score breakdown
          </div>
          <h3 className="m-0 text-[15.5px] font-semibold flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-bold text-text-primary" style={{ letterSpacing: '-0.5px' }}>
              {total}
            </span>
            <span className="font-mono text-sm font-medium text-text-muted">/{maxTotal}</span>
            <span className="text-[12.5px] font-medium text-text-muted ml-1.5">across 5 weighted dimensions</span>
          </h3>
        </div>
        <Link
          href="/methodology"
          className="text-xs text-accent whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
          }}
        >
          How we score →
        </Link>
      </div>

      <div className="px-4 pt-4 pb-4.5">
        <StackedBar cats={cats} />

        <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-4 mb-2">
          <span className="uppercase tracking-wider font-semibold">Categories</span>
          <span className="flex-1 h-px bg-border-muted" />
          <span className="italic">click a row to see evidence</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {cats.map(c => (
            <Row
              key={c.id}
              id={c.id}
              label={c.label}
              val={c.val}
              max={c.max}
              color={c.color}
              subtitle={c.subtitle}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(prev => (prev === c.id ? null : c.id))}
              factors={buildFactors(c.id, server)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
