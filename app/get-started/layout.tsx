import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Get Started with MCP',
  description: 'Learn what MCP is and get personalized server recommendations for Claude Desktop, Cursor, Claude Code, or VS Code. Set up in 30 seconds.',
  alternates: { canonical: `${SITE_URL}/get-started` },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
