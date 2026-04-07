import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Submit a Server',
  description: 'Submit a new MCP server to MCPpedia. Share your server with the community and get it scored on security, maintenance, and efficiency.',
  alternates: { canonical: `${SITE_URL}/submit` },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
