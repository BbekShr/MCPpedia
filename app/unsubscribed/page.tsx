import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Unsubscribed — MCPpedia',
  robots: { index: false },
}

export default function UnsubscribedPage() {
  return (
    <div className="max-w-[600px] mx-auto px-4 py-20 text-center">
      <p className="text-4xl mb-4">&#10003;</p>
      <h1 className="text-2xl font-semibold text-text-primary mb-2">You&apos;ve been unsubscribed</h1>
      <p className="text-text-muted mb-6">
        You won&apos;t receive any more emails from MCPpedia. You can re-subscribe anytime.
      </p>
      <Link href="/" className="text-accent hover:text-accent-hover text-sm">
        Back to MCPpedia &rarr;
      </Link>
    </div>
  )
}
