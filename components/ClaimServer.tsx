'use client'

import { useState, useEffect } from 'react'

type ProofType = 'github_org' | 'github_repo' | 'npm_package' | 'dns_txt'

const PROOF_OPTIONS: { value: ProofType; label: string; placeholder: string; hint: string }[] = [
  { value: 'github_repo', label: 'GitHub repo', placeholder: 'https://github.com/owner/repo', hint: 'Link to the repo you own or maintain.' },
  { value: 'github_org', label: 'GitHub org / user', placeholder: 'your-github-username', hint: 'The GitHub account that owns the project.' },
  { value: 'npm_package', label: 'npm package', placeholder: '@scope/package', hint: 'A package you publish for this server.' },
  { value: 'dns_txt', label: 'Domain (DNS TXT)', placeholder: 'example.com', hint: 'A domain you control that hosts this project.' },
]

export default function ClaimServer({
  serverId,
  publisherVerified,
}: {
  serverId: string
  publisherVerified: boolean
}) {
  const [checked, setChecked] = useState(false)
  const [claim, setClaim] = useState<{ verified: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [proofType, setProofType] = useState<ProofType>('github_repo')
  const [proofValue, setProofValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/claim?server_id=${serverId}`)
      .then(r => r.json())
      .then(d => { setClaim(d.claim); setChecked(true) })
      .catch(() => setChecked(true))
  }, [serverId])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId, proof_type: proofType, proof_value: proofValue.trim() }),
      })
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not submit claim. Check your proof and try again.')
        return
      }
      setClaim({ verified: false })
      setOpen(false)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!checked) return null

  // Already the verified publisher (this user's approved claim, or the flag is set).
  if (publisherVerified || claim?.verified) {
    return (
      <p className="mt-3 text-xs text-green flex items-center gap-1.5">
        <span aria-hidden="true">✓</span>
        {claim?.verified ? 'You are the verified publisher of this server.' : 'This server has a verified publisher.'}
      </p>
    )
  }

  // Pending claim by this user.
  if (claim && !claim.verified) {
    return (
      <p className="mt-3 text-xs text-text-muted">
        Your ownership claim is pending review by a maintainer.
      </p>
    )
  }

  const active = PROOF_OPTIONS.find(o => o.value === proofType)!

  return (
    <div className="mt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-text-primary hover:border-accent hover:text-accent transition-colors"
        >
          Claim this server
        </button>
      ) : (
        <div className="border border-border rounded-md p-3 bg-bg">
          <p className="text-xs text-text-muted mb-2">
            Claim ownership to get a verified-publisher badge. A maintainer reviews your proof before it&apos;s granted.
          </p>
          <label className="block text-xs text-text-muted mb-1">Proof of ownership</label>
          <select
            value={proofType}
            onChange={e => { setProofType(e.target.value as ProofType); setProofValue('') }}
            className="w-full mb-2 px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary"
          >
            {PROOF_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={proofValue}
            onChange={e => setProofValue(e.target.value)}
            placeholder={active.placeholder}
            className="w-full mb-1 px-2 py-1.5 text-sm border border-border rounded bg-bg text-text-primary placeholder:text-text-muted"
          />
          <p className="text-xs text-text-muted mb-2">{active.hint}</p>
          {error && <p className="text-xs text-red mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={submitting || proofValue.trim().length === 0}
              className="text-xs px-3 py-1 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit claim'}
            </button>
            <button
              onClick={() => { setOpen(false); setError(null) }}
              disabled={submitting}
              className="text-xs px-3 py-1 rounded border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
