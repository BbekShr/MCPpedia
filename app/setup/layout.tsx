import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'How to Set Up MCP Servers',
  description: 'Step-by-step visual guide to installing MCP servers in Claude Desktop, Cursor, Claude Code, and VS Code. Works for any server on MCPpedia.',
  alternates: { canonical: `${SITE_URL}/setup` },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
