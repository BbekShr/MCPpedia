import Link from 'next/link'
import { Chip, daysAgo, Icon, SectionHeader } from './helpers'
import type { SecurityAdvisory } from '@/lib/types'

export interface HomeAdvisory extends Pick<
  SecurityAdvisory,
  'id' | 'cve_id' | 'severity' | 'title' | 'status' | 'published_at'
> {
  server_slug: string
  server_name: string
}

function severityColor(sev: string): string {
  if (sev === 'critical' || sev === 'high') return 'var(--red)'
  if (sev === 'medium') return 'var(--yellow)'
  return 'var(--text-muted)'
}

function StatusChip({ status }: { status: HomeAdvisory['status'] }) {
  return status === 'fixed' ? (
    <Chip tone="green" size="sm"><Icon name="check" size={10} /> Fixed</Chip>
  ) : (
    <Chip tone="red" size="sm"><Icon name="alert" size={10} /> Unpatched</Chip>
  )
}

function AdvisoryRow({ a, last }: { a: HomeAdvisory; last: boolean }) {
  const color = severityColor(a.severity)
  const days = daysAgo(a.published_at)
  const borderStyle = last ? 'none' : '1px solid var(--border-muted)'
  return (
    <Link
      href={`/s/${a.server_slug}#security`}
      className="adv-row block text-text-primary"
      style={{ borderBottom: borderStyle }}
    >
      {/* Mobile layout */}
      <div className="flex md:hidden flex-col gap-1.5 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="rounded-full shrink-0"
              style={{ width: 8, height: 8, background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` }}
            />
            <span className="font-mono text-[11.5px] text-text-muted truncate">
              {a.cve_id || a.id.slice(0, 8)}
            </span>
          </div>
          <StatusChip status={a.status} />
        </div>
        <div className="text-[13px] font-medium line-clamp-2">
          <span className="font-mono text-text-primary text-xs mr-1.5">{a.server_name}</span>
          <span>{a.title}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[11.5px] text-text-muted flex gap-2.5">
            <span className="font-mono uppercase font-semibold" style={{ color, fontSize: 10.5, letterSpacing: '0.06em' }}>
              {a.severity}
            </span>
            {days !== null && <span>{days}d ago</span>}
          </div>
          <span className="text-accent text-[12px] inline-flex items-center gap-0.5">
            Read <Icon name="chevronR" size={11} />
          </span>
        </div>
      </div>

      {/* Desktop layout */}
      <div
        className="hidden md:grid gap-4 items-center px-3.5 py-3"
        style={{ gridTemplateColumns: 'minmax(120px, 180px) 1fr 110px 90px' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="rounded-full shrink-0"
            style={{ width: 8, height: 8, background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` }}
          />
          <span className="font-mono text-[11.5px] text-text-muted truncate">
            {a.cve_id || a.id.slice(0, 8)}
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium truncate">
            <span className="font-mono text-text-primary text-xs mr-2">{a.server_name}</span>
            <span>{a.title}</span>
          </div>
          <div className="text-[11.5px] text-text-muted mt-0.5 flex gap-2.5">
            <span className="font-mono uppercase font-semibold" style={{ color, fontSize: 10.5, letterSpacing: '0.06em' }}>
              {a.severity}
            </span>
            {days !== null && <span>{days}d ago</span>}
          </div>
        </div>
        <div><StatusChip status={a.status} /></div>
        <div className="text-right text-accent text-[12.5px] inline-flex items-center gap-1 justify-end">
          Read <Icon name="chevronR" size={11} />
        </div>
      </div>
    </Link>
  )
}

export default function Advisories({ advisories }: { advisories: HomeAdvisory[] }) {
  if (advisories.length === 0) return null
  return (
    <section
      style={{ padding: 'var(--section-pad) 0', borderTop: '1px solid var(--border-muted)' }}
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <SectionHeader
          eyebrow="Security"
          title="Recent advisories"
          desc="Published CVEs affecting tracked servers. Fixed means a patched version is available."
          right={
            <Link
              href="/security"
              className="text-[13px] text-accent inline-flex items-center gap-1"
            >
              All advisories <Icon name="chevronR" size={12} />
            </Link>
          }
        />
        <div
          className="overflow-hidden rounded-lg bg-bg"
          style={{ border: '1px solid var(--border)' }}
        >
          {advisories.map((a, i) => (
            <AdvisoryRow key={a.id} a={a} last={i === advisories.length - 1} />
          ))}
        </div>
      </div>
    </section>
  )
}
