'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function UnsubscribeConfirm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function confirm() {
    setState('loading')
    const res = await fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    })
    setState(res.ok ? 'done' : 'error')
  }

  if (state === 'done') {
    return (
      <div aria-live="polite">
        <p className="text-4xl mb-4">&#10003;</p>
        <p className="text-text-muted mb-6">You won&apos;t receive any more emails from MCPpedia.</p>
        <Link href="/" className="text-accent hover:text-accent-hover text-sm">
          Back to MCPpedia &rarr;
        </Link>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div aria-live="polite" className="text-text-muted text-sm">
        Something went wrong. The link may have expired.{' '}
        <Link href="/" className="text-accent">Back to MCPpedia</Link>.
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={confirm}
      disabled={state === 'loading'}
      className="inline-flex items-center px-5 py-2.5 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover disabled:opacity-60"
    >
      {state === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
    </button>
  )
}
