import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import Link from 'next/link'
import type { Edit, ServerChange } from '@/lib/types'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `Edit History - ${slug}`,
    robots: { index: false, follow: false },
  }
}

// Unified timeline row. Comes from either:
//   - `server_changes` — every actual write to the servers table (bots,
//     admins, approved edits get logged here by the audit trigger)
//   - `edits` — user-proposed changes, including pending and rejected ones
//     that never made it to server_changes
type TimelineEntry =
  | {
      kind: 'change'
      id: string
      at: string
      field: string
      oldValue: unknown
      newValue: unknown
      actorLabel: string | null
      profile: ServerChange['profile']
    }
  | {
      kind: 'edit'
      id: string
      at: string
      field: string
      oldValue: unknown
      newValue: unknown
      status: 'pending' | 'approved' | 'rejected'
      reason: string | null
      profile: Edit['profile']
    }

function formatValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}

function actorBadge(entry: TimelineEntry): { label: string; tone: 'human' | 'bot' | 'system' } {
  if (entry.kind === 'edit') {
    return { label: `@${entry.profile?.username ?? 'anonymous'}`, tone: 'human' }
  }
  if (entry.profile?.username) return { label: `@${entry.profile.username}`, tone: 'human' }
  if (entry.actorLabel?.startsWith('bot-')) return { label: entry.actorLabel, tone: 'bot' }
  return { label: entry.actorLabel || 'system', tone: 'system' }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow text-white',
  approved: 'bg-green text-white',
  rejected: 'bg-red text-white',
}

const TONE_COLORS: Record<'human' | 'bot' | 'system', string> = {
  human: 'bg-accent/10 text-accent border-accent/30',
  bot: 'bg-blue/10 text-blue border-blue/30',
  system: 'bg-text-muted/10 text-text-muted border-border',
}

export default async function EditHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: server } = await supabase
    .from('servers')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!server) notFound()

  const [{ data: changesRaw }, { data: editsRaw }] = await Promise.all([
    supabase
      .from('server_changes')
      .select('id, field_name, old_value, new_value, actor_id, actor_label, changed_at')
      .eq('server_id', server.id)
      .order('changed_at', { ascending: false })
      .limit(200),
    supabase
      .from('edits')
      .select('id, field_name, old_value, new_value, edit_reason, status, created_at, profile:profiles(id, username, avatar_url)')
      .eq('server_id', server.id)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const rawChanges = (changesRaw as unknown as ServerChange[] | null) ?? []

  // server_changes.actor_id has no FK to profiles (audit rows survive profile
  // deletion), so we join in JS instead of relying on a PostgREST embed.
  const actorIds = Array.from(
    new Set(rawChanges.map(c => c.actor_id).filter((id): id is string => !!id)),
  )
  const profileById = new Map<string, ServerChange['profile']>()
  if (actorIds.length > 0) {
    const { data: profilesRaw } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', actorIds)
    for (const p of (profilesRaw ?? []) as NonNullable<ServerChange['profile']>[]) {
      profileById.set(p.id, p)
    }
  }

  // Approved edits are double-counted: they appear in `edits` (lifecycle) AND
  // in `server_changes` (the actual write). The change row is more precise
  // (correct timestamp, actor) but loses the proposer + edit_reason context.
  // Strategy: show all server_changes; show only pending/rejected edits.
  const changes = rawChanges.map(c => ({ ...c, profile: c.actor_id ? profileById.get(c.actor_id) ?? null : null }))
  const edits = ((editsRaw as unknown as Edit[] | null) ?? []).filter(e => e.status !== 'approved')

  const timeline: TimelineEntry[] = [
    ...changes.map((c): TimelineEntry => ({
      kind: 'change',
      id: `c-${c.id}`,
      at: c.changed_at,
      field: c.field_name,
      oldValue: c.old_value,
      newValue: c.new_value,
      actorLabel: c.actor_label,
      profile: c.profile,
    })),
    ...edits.map((e): TimelineEntry => ({
      kind: 'edit',
      id: `e-${e.id}`,
      at: e.created_at,
      field: e.field_name,
      oldValue: e.old_value,
      newValue: e.new_value,
      status: e.status,
      reason: e.edit_reason,
      profile: e.profile,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link href={`/s/${slug}`} className="text-accent hover:text-accent-hover">{server.name}</Link>
        <span>/</span>
        <span>History</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Edit history</h1>
          <p className="text-sm text-text-muted mt-1">
            Every change to this entry — bots, contributors, and approved proposals.
          </p>
        </div>
        <Link
          href={`/s/${slug}/edit`}
          className="text-sm border border-border rounded-md px-3 py-1.5 text-text-primary hover:border-accent hover:text-accent"
        >
          Propose an edit
        </Link>
      </div>

      {timeline.length === 0 ? (
        <p className="text-text-muted text-sm">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {timeline.map(entry => {
            const actor = actorBadge(entry)
            return (
              <li key={entry.id} className="border border-border rounded-md p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded border ${TONE_COLORS[actor.tone]}`}>
                    {actor.label}
                  </span>
                  <span className="text-xs text-text-muted">
                    {entry.kind === 'edit' ? 'proposed' : 'changed'}
                  </span>
                  <code className="font-mono text-xs text-text-primary bg-bg-secondary border border-border rounded px-1.5 py-0.5">
                    {entry.field}
                  </code>
                  {entry.kind === 'edit' && (
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[entry.status]}`}>
                      {entry.status}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-text-muted">
                    {new Date(entry.at).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-text-muted mb-1">Before</div>
                    <pre className="m-0 px-2 py-1.5 rounded border border-border bg-red/5 font-mono text-text-primary whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {formatValue(entry.oldValue)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-text-muted mb-1">After</div>
                    <pre className="m-0 px-2 py-1.5 rounded border border-border bg-green/5 font-mono text-text-primary whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {formatValue(entry.newValue)}
                    </pre>
                  </div>
                </div>

                {entry.kind === 'edit' && entry.reason && (
                  <p className="mt-2 text-xs text-text-muted italic">&ldquo;{entry.reason}&rdquo;</p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
