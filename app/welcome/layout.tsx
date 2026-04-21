import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pick a username',
  description: 'Choose your MCPpedia username.',
  robots: { index: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
