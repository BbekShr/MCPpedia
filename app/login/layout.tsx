import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to MCPpedia with GitHub to submit servers, propose edits, and join the community.',
  alternates: { canonical: `${SITE_URL}/login` },
  robots: { index: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
