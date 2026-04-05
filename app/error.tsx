'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-4xl mb-4">!</div>
      <h2 className="text-xl font-semibold text-text-primary mb-2">Something went wrong</h2>
      <p className="text-text-muted mb-6 text-sm">
        An unexpected error occurred. This has been logged.
      </p>
      {error?.message && (
        <p className="text-xs text-red font-mono mb-4 text-left bg-code-bg p-2 rounded">{error.message}</p>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
