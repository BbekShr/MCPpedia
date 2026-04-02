import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About',
  description: 'MCPpedia is the free encyclopedia for MCP servers.',
}

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">About MCPpedia</h1>

      <div className="space-y-6 text-sm text-text-primary leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">Mission</h2>
          <p>
            MCPpedia is the definitive reference for every MCP server in existence.
            It is free, comprehensive, and designed to be
            the first place anyone goes when they need to find, understand, or set up an MCP server.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">How it works</h2>
          <p className="mb-3">
            MCPpedia combines automated discovery with community curation:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li><strong className="text-text-primary">Bots discover</strong> — Our automated pipeline searches GitHub, npm, and PyPI daily for new MCP servers.</li>
            <li><strong className="text-text-primary">AI extracts</strong> — Tool schemas are automatically parsed from READMEs and source code.</li>
            <li><strong className="text-text-primary">Users submit</strong> — Anyone can submit servers and suggest additions.</li>
          </ul>
        </section>


        <section>
          <h2 className="text-lg font-semibold mb-2">Principles</h2>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li><strong className="text-text-primary">Completeness over curation</strong> — Every server belongs here.</li>
            <li><strong className="text-text-primary">Zero friction to read</strong> — No login walls. No popups.</li>
            <li><strong className="text-text-primary">Machines maintain, humans improve</strong> — Bots keep data fresh. Community adds context.</li>
            <li><strong className="text-text-primary">Clean and fast</strong> — Information-dense, scannable, beautiful through clarity.</li>
            <li><strong className="text-text-primary">Independent</strong> — Built and maintained independently.</li>
          </ul>
        </section>

        <section className="pt-4 border-t border-border">
          <p className="text-text-muted">
            Have questions? <Link href="/submit" className="text-accent hover:text-accent-hover">Submit a server</Link> or
            browse the <Link href="/servers" className="text-accent hover:text-accent-hover">directory</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
