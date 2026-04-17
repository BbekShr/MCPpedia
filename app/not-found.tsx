import Link from 'next/link'
import BlinkLogo from '@/components/BlinkLogo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found — MCPpedia',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="flex justify-center mb-6">
        <BlinkLogo size={64} className="text-accent" />
      </div>
      <div className="text-6xl font-bold text-text-muted mb-4">404</div>
      <h1 className="text-xl font-semibold text-text-primary mb-2">Page not found</h1>
      <p className="text-text-muted mb-6">
        The server or page you&apos;re looking for doesn&apos;t exist on MCPpedia.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/"
          className="px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors"
        >
          Go home
        </Link>
        <Link
          href="/servers"
          className="px-4 py-2 text-sm rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          Browse servers
        </Link>
      </div>
    </div>
  )
}
