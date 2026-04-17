import Link from 'next/link'
import type { Metadata } from 'next'
import UnsubscribeConfirm from './UnsubscribeConfirm'

export const metadata: Metadata = {
  title: 'Unsubscribe — MCPpedia',
  robots: { index: false },
}

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (token) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Unsubscribe from MCPpedia?</h1>
        <p className="text-text-muted mb-6">
          Click the button below to confirm you want to unsubscribe. You can re-subscribe anytime.
        </p>
        <UnsubscribeConfirm token={token} />
      </div>
    )
  }

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
