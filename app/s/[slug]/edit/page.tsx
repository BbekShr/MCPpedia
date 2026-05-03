'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Server } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import DiffView from '@/components/DiffView'
import InstallConfigEditor from '@/components/edit/InstallConfigEditor'
import ListEditor from '@/components/edit/ListEditor'

type FormState = {
  name: string; tagline: string; description: string
  install_configs: string; tools: string; resources: string
  api_name: string; api_pricing: string; api_rate_limits: string
  homepage_url: string; npm_package: string; pip_package: string
}

type FieldKey = keyof FormState
type FieldType = 'text' | 'textarea' | 'json' | 'select'

const JSON_FIELDS: readonly FieldKey[] = ['install_configs', 'tools', 'resources'] as const

// Mirrors EDITABLE_FIELDS in lib/validators.ts. Non-admin proposals to other
// fields are rejected by the /api/edit zod schema, so we strip those before
// submitting and warn the user in the review panel.
const PROPOSABLE_FIELDS: readonly FieldKey[] = [
  'name', 'tagline', 'description', 'api_name', 'api_pricing',
  'api_rate_limits', 'homepage_url', 'npm_package', 'pip_package',
] as const

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name',
  tagline: 'Tagline',
  description: 'Description',
  install_configs: 'Install Config (JSON)',
  tools: 'Tools (JSON array)',
  resources: 'Resources (JSON array)',
  api_name: 'API Name',
  api_pricing: 'API Pricing',
  api_rate_limits: 'Rate Limits',
  homepage_url: 'Homepage URL',
  npm_package: 'npm Package',
  pip_package: 'pip Package',
}

function serverToForm(s: Server): FormState {
  return {
    name: s.name || '',
    tagline: s.tagline || '',
    description: s.description || '',
    install_configs: JSON.stringify(s.install_configs ?? {}, null, 2),
    tools: JSON.stringify(s.tools ?? [], null, 2),
    resources: JSON.stringify(s.resources ?? [], null, 2),
    api_name: s.api_name || '',
    api_pricing: s.api_pricing || 'unknown',
    api_rate_limits: s.api_rate_limits || '',
    homepage_url: s.homepage_url || '',
    npm_package: s.npm_package || '',
    pip_package: s.pip_package || '',
  }
}

interface FieldProps {
  name: FieldKey
  label: string
  type?: FieldType
  rows?: number
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  hint?: string
}

function Field({ name, label, type = 'text', rows = 1, value, onChange, disabled = false, hint }: FieldProps) {
  return (
    <div className="border border-border rounded-md p-4">
      <label htmlFor={`field-${name}`} className="text-sm font-medium text-text-primary mb-2 block">
        {label}
      </label>

      {type === 'select' ? (
        <select
          id={`field-${name}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
        >
          <option value="free">Free</option>
          <option value="freemium">Freemium</option>
          <option value="paid">Paid</option>
          <option value="unknown">Unknown</option>
        </select>
      ) : type === 'textarea' || type === 'json' ? (
        <textarea
          id={`field-${name}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent resize-y disabled:opacity-50 ${type === 'json' ? 'font-mono text-xs' : ''}`}
        />
      ) : (
        <input
          id={`field-${name}`}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
        />
      )}

      {hint && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

type Change = {
  name: FieldKey
  label: string
  isJson: boolean
  oldValue: unknown
  newValue: unknown
  newRaw: string
  parseError: string | null
  proposable: boolean
}

export default function EditServerPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [server, setServer] = useState<Server | null>(null)
  const [original, setOriginal] = useState<FormState | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [editSummary, setEditSummary] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // When someone else changes a field we're trying to edit between page-load
  // and submit, surface a conflict instead of silently overwriting.
  const [conflicts, setConflicts] = useState<{ field: FieldKey; label: string; mineSnapshot: unknown; theirsCurrent: unknown }[] | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single().then(({ data: p }) => {
          setIsAdmin(p?.role === 'admin' || p?.role === 'maintainer')
        })
      }
    })
    supabase.from('servers').select(PUBLIC_SERVER_FIELDS).eq('slug', slug).single().then(({ data }) => {
      if (data) {
        const s = data as unknown as Server
        setServer(s)
        const initial = serverToForm(s)
        setOriginal(initial)
        setForm(initial)
      }
    })
  }, [slug, supabase])

  // Compute the set of fields whose form value differs from the loaded server.
  // For JSON fields we compare parsed values, so the structured editor's
  // canonical re-formatting (different whitespace, key ordering) doesn't
  // register as a change on its own.
  const changes = useMemo<Change[]>(() => {
    if (!form || !original || !server) return []
    const out: Change[] = []
    for (const key of Object.keys(form) as FieldKey[]) {
      const isJson = JSON_FIELDS.includes(key)
      let parsed: unknown = form[key]
      let parseError: string | null = null
      if (isJson) {
        try { parsed = JSON.parse(form[key]) }
        catch (e) { parseError = e instanceof Error ? e.message : 'Invalid JSON' }
        if (!parseError) {
          const oldCanon = JSON.stringify(server[key as keyof Server] ?? null)
          const newCanon = JSON.stringify(parsed ?? null)
          if (oldCanon === newCanon) continue
        } else if (form[key] === original[key]) {
          // Original was already invalid (shouldn't happen) and user hasn't
          // touched it — don't surface as a change.
          continue
        }
      } else {
        if (form[key] === original[key]) continue
        if (form[key] === '') parsed = null
      }
      out.push({
        name: key,
        label: FIELD_LABELS[key],
        isJson,
        oldValue: server[key as keyof Server],
        newValue: parsed,
        newRaw: form[key],
        parseError,
        proposable: PROPOSABLE_FIELDS.includes(key),
      })
    }
    return out
  }, [form, original, server])

  const hasParseErrors = changes.some(c => c.parseError)
  const submittableChanges = isAdmin ? changes : changes.filter(c => c.proposable)
  const blockedByPermissions = !isAdmin && changes.some(c => !c.proposable)

  // Re-fetch only the fields we're about to change and compare against the
  // values that were on screen when the user opened the form. Avoids the
  // false-positive storm a global `updated_at` check would produce against
  // the half-dozen daily bots updating stars / downloads / etc.
  async function detectConflicts(): Promise<typeof conflicts> {
    if (!server || submittableChanges.length === 0) return null
    const cols = Array.from(new Set(['id', ...submittableChanges.map(c => c.name)])).join(',')
    const { data: current } = await supabase
      .from('servers')
      .select(cols)
      .eq('id', server.id)
      .single<Record<string, unknown>>()
    if (!current) return null
    const found = submittableChanges
      .filter(c => {
        const before = JSON.stringify((server as unknown as Record<string, unknown>)[c.name] ?? null)
        const now = JSON.stringify(current[c.name] ?? null)
        return before !== now
      })
      .map(c => ({
        field: c.name,
        label: c.label,
        mineSnapshot: (server as unknown as Record<string, unknown>)[c.name],
        theirsCurrent: current[c.name],
      }))
    return found.length > 0 ? found : null
  }

  async function handleSubmit(opts: { override?: boolean } = {}) {
    if (!server || !user || submittableChanges.length === 0) return
    if (!isAdmin && editSummary.trim().length === 0) {
      setError('Please describe what you changed and why.')
      return
    }
    setSubmitting(true)
    setError('')

    if (!opts.override) {
      const found = await detectConflicts()
      if (found) {
        setConflicts(found)
        setSubmitting(false)
        return
      }
    }

    try {
      if (isAdmin) {
        // Single batched update for everything that changed.
        const update: Record<string, unknown> = {}
        for (const c of submittableChanges) update[c.name] = c.newValue
        if (submittableChanges.some(c => c.name === 'description')) {
          update.description_source = 'human'
        }
        const { error: err } = await supabase.from('servers').update(update).eq('id', server.id)
        if (err) throw new Error(err.message)
      } else {
        // One /api/edit POST per field — moderators decide each independently.
        // The shared edit summary becomes the per-row reason.
        const reason = editSummary.trim()
        const results = await Promise.all(submittableChanges.map(c =>
          fetch('/api/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              server_id: server.id,
              field_name: c.name,
              old_value: typeof c.oldValue === 'string' ? c.oldValue : JSON.stringify(c.oldValue ?? ''),
              new_value: c.newRaw,
              edit_reason: reason,
            }),
          }).then(async r => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }))
        ))
        const failed = results.filter(r => !r.ok)
        if (failed.length > 0) {
          throw new Error(
            `${failed.length} of ${results.length} field${results.length === 1 ? '' : 's'} failed to submit. ` +
            (failed[0].body?.error?.fieldErrors ? 'Check that values are within length limits.' : '')
          )
        }
      }

      router.push(`/s/${slug}${isAdmin ? '' : '/history'}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-4">Edit Server</h1>
        <p className="text-text-muted mb-6">Sign in to edit this page.</p>
        <a href={`/login?redirect=/s/${slug}/edit`} className="text-accent hover:text-accent-hover">Sign in with GitHub</a>
      </div>
    )
  }

  if (!server || !form) return <div className="max-w-3xl mx-auto px-4 py-12 text-text-muted">Loading...</div>

  const fieldProps = (name: FieldKey, type?: FieldType, rows?: number, opts?: { hint?: string; disabled?: boolean }): FieldProps => ({
    name,
    label: FIELD_LABELS[name],
    type,
    rows,
    value: form[name],
    onChange: (v: string) => setForm(f => (f ? { ...f, [name]: v } : f)),
    hint: opts?.hint,
    disabled: opts?.disabled,
  })

  const adminOnlyHint = !isAdmin ? 'Admin-only field. Visible for context but cannot be proposed by contributors.' : undefined

  // ============= Review mode =============
  if (reviewing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Review your changes</h1>
            <p className="text-sm text-text-muted">
              {isAdmin
                ? 'Saving directly as admin. All listed fields will update at once.'
                : `${submittableChanges.length} change${submittableChanges.length === 1 ? '' : 's'} to propose. Each becomes its own moderator review.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setReviewing(false); setError('') }}
            disabled={submitting}
            className="text-sm text-text-muted hover:text-text-primary border border-border rounded-md px-3 py-1.5"
          >
            ← Keep editing
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md border border-red bg-red/5 text-sm text-red">{error}</div>
        )}

        {conflicts && (
          <div className="mb-4 p-4 rounded-md border border-yellow bg-yellow/5">
            <p className="text-sm font-semibold text-text-primary mb-1">
              Someone else changed {conflicts.length === 1 ? 'this field' : 'these fields'} since you started editing.
            </p>
            <p className="text-xs text-text-muted mb-3">
              Saving now will overwrite their change. Reload to see the latest, or override to keep your version.
            </p>
            <ol className="space-y-3 mb-3">
              {conflicts.map(c => (
                <li key={c.field} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary">{c.label}</span>
                    <code className="font-mono text-text-muted">{c.field}</code>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-text-muted mb-0.5">Their version (current)</div>
                      <DiffView oldValue={c.mineSnapshot} newValue={c.theirsCurrent} />
                    </div>
                    <div>
                      <div className="text-text-muted mb-0.5">Your proposed version</div>
                      <DiffView
                        oldValue={c.theirsCurrent}
                        newValue={submittableChanges.find(s => s.name === c.field)?.newValue ?? null}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs px-3 py-1.5 rounded border border-border text-text-primary hover:border-accent"
              >
                Reload (discard my changes)
              </button>
              <button
                type="button"
                onClick={() => { setConflicts(null); handleSubmit({ override: true }) }}
                disabled={submitting}
                className="text-xs px-3 py-1.5 rounded border border-red text-red hover:bg-red/5 disabled:opacity-50"
              >
                Override and save anyway
              </button>
            </div>
          </div>
        )}

        {blockedByPermissions && (
          <div className="mb-4 p-3 rounded-md border border-yellow bg-yellow/5 text-sm text-text-primary">
            Some fields you changed (
            {changes.filter(c => !c.proposable).map(c => c.label).join(', ')}
            ) are admin-only and won&apos;t be submitted. Ask a maintainer if you need them updated.
          </div>
        )}

        <ol className="space-y-4 mb-6">
          {submittableChanges.map(c => (
            <li key={c.name} className="border border-border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-primary">{c.label}</span>
                <code className="font-mono text-xs text-text-muted">{c.name}</code>
              </div>
              <DiffView oldValue={c.oldValue} newValue={c.newValue} />
            </li>
          ))}
        </ol>

        {!isAdmin && (
          <div className="mb-4">
            <label htmlFor="edit-summary" className="text-sm font-medium text-text-primary mb-1.5 block">
              Edit summary <span className="text-red">*</span>
            </label>
            <textarea
              id="edit-summary"
              value={editSummary}
              onChange={e => setEditSummary(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Briefly describe what you changed and why (e.g. 'Updated install instructions for Claude Desktop 0.7+')."
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-bg text-text-primary focus:outline-none focus:border-accent resize-y"
            />
            <p className="mt-1 text-xs text-text-muted">Shown to moderators when they review your proposal.</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => { setReviewing(false); setError('') }}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-md border border-border text-text-primary hover:border-accent disabled:opacity-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={submitting || submittableChanges.length === 0 || conflicts !== null}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : isAdmin ? `Save ${submittableChanges.length} change${submittableChanges.length === 1 ? '' : 's'}` : `Propose ${submittableChanges.length} change${submittableChanges.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    )
  }

  // ============= Edit mode =============
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-32">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Edit: {server.name}</h1>
          <p className="text-sm text-text-muted">
            {isAdmin
              ? 'Admin mode — changes save directly when you confirm.'
              : 'Edit any field, then review and submit. Your changes go to a moderator before they appear.'}
          </p>
        </div>
        <Link href={`/s/${slug}`} className="text-sm text-text-muted hover:text-text-primary border border-border rounded-md px-3 py-1.5">
          Cancel
        </Link>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Basic Info</h2>
        <Field {...fieldProps('name')} />
        <Field {...fieldProps('tagline')} />
        <Field {...fieldProps('homepage_url')} />
        <Field {...fieldProps('npm_package')} />
        <Field {...fieldProps('pip_package')} />

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">Quick Install Config</h2>
        <div className="border border-border rounded-md p-4">
          <label className="text-sm font-medium text-text-primary mb-2 block">Install Config</label>
          <InstallConfigEditor
            value={form.install_configs}
            onChange={v => setForm(f => (f ? { ...f, install_configs: v } : f))}
            serverSlug={slug}
            disabled={!isAdmin}
          />
          {adminOnlyHint && <p className="mt-1.5 text-xs text-text-muted">{adminOnlyHint}</p>}
        </div>

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">About</h2>
        <Field {...fieldProps('description', 'textarea', 6, {
          hint: 'Supports markdown — **bold**, *italic*, [links](url), `code`, lists.',
        })} />

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">Tools & Resources</h2>
        <div className="border border-border rounded-md p-4">
          <label className="text-sm font-medium text-text-primary mb-2 block">Tools</label>
          <ListEditor
            value={form.tools}
            onChange={v => setForm(f => (f ? { ...f, tools: v } : f))}
            itemLabel="tool"
            emptyTemplate={{ name: '', description: '' }}
            fields={[
              { key: 'name', label: 'Name', type: 'text', placeholder: 'fetch_url' },
              { key: 'description', label: 'Description', type: 'textarea', rows: 2 },
              { key: 'input_schema', label: 'Input schema (advanced)', type: 'json', rows: 4, placeholder: '{ "type": "object", "properties": {} }' },
            ]}
            disabled={!isAdmin}
          />
          {adminOnlyHint && <p className="mt-1.5 text-xs text-text-muted">{adminOnlyHint} Tools are usually kept in sync by the extract-schemas bot.</p>}
        </div>
        <div className="border border-border rounded-md p-4">
          <label className="text-sm font-medium text-text-primary mb-2 block">Resources</label>
          <ListEditor
            value={form.resources}
            onChange={v => setForm(f => (f ? { ...f, resources: v } : f))}
            itemLabel="resource"
            emptyTemplate={{ name: '', description: '' }}
            fields={[
              { key: 'name', label: 'Name', type: 'text' },
              { key: 'description', label: 'Description', type: 'textarea', rows: 2 },
              { key: 'uri_template', label: 'URI template', type: 'text', placeholder: 'file:///{path}' },
            ]}
            disabled={!isAdmin}
          />
          {adminOnlyHint && <p className="mt-1.5 text-xs text-text-muted">{adminOnlyHint}</p>}
        </div>

        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide pt-4">API Info</h2>
        <Field {...fieldProps('api_name')} />
        <Field {...fieldProps('api_pricing', 'select')} />
        <Field {...fieldProps('api_rate_limits')} />
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-bg/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-text-muted">
            {changes.length === 0 ? (
              'No changes yet.'
            ) : (
              <>
                <span className="text-text-primary font-medium">{changes.length}</span> change{changes.length === 1 ? '' : 's'}
                {hasParseErrors && <span className="text-red ml-2">· invalid JSON in {changes.filter(c => c.parseError).length} field{changes.filter(c => c.parseError).length === 1 ? '' : 's'}</span>}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setReviewing(true)}
            disabled={changes.length === 0 || hasParseErrors}
            className="px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            Review changes →
          </button>
        </div>
      </div>
    </div>
  )
}
