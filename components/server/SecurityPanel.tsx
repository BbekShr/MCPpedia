'use client'

import { useState } from 'react'
import type { Server, SecurityAdvisory } from '@/lib/types'
import { Chip, Icon } from './helpers'

const INITIAL_VISIBLE = 5

function severityColor(sev: string): string {
  if (sev === 'critical' || sev === 'high') return 'var(--red)'
  if (sev === 'medium') return 'var(--yellow)'
  return 'var(--text-muted)'
}

function timeAgo(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function AdvisoryRow({ a }: { a: SecurityAdvisory }) {
  const color = a.status === 'fixed' ? 'var(--green)' : severityColor(a.severity)
  return (
    <div
      className="p-2.5 rounded-md flex gap-2.5 items-start"
      style={{
        border: '1px solid var(--border)',
        opacity: a.status === 'fixed' ? 0.65 : 1,
      }}
    >
      <span
        className="self-stretch rounded-sm shrink-0"
        style={{ width: 6, background: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex gap-2 items-center flex-wrap">
          {a.cve_id && <span className="font-mono text-[11.5px] text-text-muted">{a.cve_id}</span>}
          <Chip
            tone={
              a.status === 'fixed'
                ? 'green'
                : a.severity === 'high' || a.severity === 'critical'
                  ? 'red'
                  : 'yellow'
            }
          >
            {a.severity}
            {a.status === 'fixed' ? ' · fixed' : ''}
          </Chip>
          {a.cvss_score != null && (
            <span className="font-mono text-[11px] text-text-muted tabular-nums">CVSS {a.cvss_score}</span>
          )}
        </div>
        <p className="mt-1 mb-0.5 font-semibold text-[13px]">{a.title}</p>
        {a.description && (
          <p className="m-0 text-[12.5px] text-text-muted leading-[1.5]">{a.description}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11.5px] text-text-muted">
          {a.affected_versions && (
            <span>
              Affected: <code className="font-mono">{a.affected_versions}</code>
            </span>
          )}
          {a.fixed_version && (
            <span style={{ color: 'var(--green)' }}>
              Fixed in <code className="font-mono">{a.fixed_version}</code>
            </span>
          )}
          {a.source_url && (
            <a
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              source →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SecurityPanel({
  server,
  advisories,
}: {
  server: Server
  advisories: SecurityAdvisory[]
}) {
  const [expanded, setExpanded] = useState(false)

  // `advisories` arrives ordered by `published_at DESC` from the page query,
  // so slicing the first 5 shows the most recent.
  const open = advisories.filter(a => a.status === 'open')
  const fixed = advisories.filter(a => a.status === 'fixed')
  const pkg = server.npm_package || server.pip_package
  const hasAny = advisories.length > 0
  const hiddenCount = Math.max(0, advisories.length - INITIAL_VISIBLE)
  const visible = expanded ? advisories : advisories.slice(0, INITIAL_VISIBLE)

  return (
    <div
      className="rounded-lg bg-bg p-4"
      style={{
        border: `1px solid ${open.length ? 'color-mix(in srgb, var(--red) 35%, transparent)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="m-0 text-[15px] font-semibold flex items-center gap-1.5">
          <Icon name="shield" size={14} /> Security
        </h3>
        <span className="font-mono text-[11px] text-text-muted">
          OSV.dev
          {server.last_security_scan ? ` · updated ${timeAgo(server.last_security_scan)}` : ''}
        </span>
      </div>

      {!hasAny ? (
        <div
          className="rounded-md flex gap-2.5 items-start p-3.5"
          style={{
            background: 'color-mix(in srgb, var(--green) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)',
          }}
        >
          <span className="mt-0.5" style={{ color: 'var(--green)' }}>
            <Icon name="check" size={16} />
          </span>
          <div>
            <p className="m-0 font-semibold text-text-primary">No known CVEs.</p>
            <p className="mt-0.5 text-[12.5px] text-text-muted">
              {pkg ? `Checked ${pkg} against OSV.dev.` : 'No package registry to scan.'}
              {server.cve_count === 0 && fixed.length > 0 && ` ${fixed.length} previously resolved.`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-2.5">
            {open.length > 0 && <Chip tone="red">{open.length} open</Chip>}
            {fixed.length > 0 && <Chip tone="green">{fixed.length} fixed</Chip>}
          </div>
          <div className="flex flex-col gap-2">
            {visible.map(a => (
              <AdvisoryRow key={a.id} a={a} />
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
              className="mt-2.5 w-full text-[12.5px] font-medium text-accent hover:text-accent-hover py-2 rounded-md"
              style={{ border: '1px dashed var(--border)' }}
            >
              {expanded ? 'Show fewer' : `Show ${hiddenCount} more advisor${hiddenCount === 1 ? 'y' : 'ies'}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
