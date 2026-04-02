import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About',
  description: 'MCPpedia is the free, open, community-driven encyclopedia for MCP servers.',
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
            Like Wikipedia, it is free, comprehensive, community-maintained, and designed to be
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
            <li><strong className="text-text-primary">Community improves</strong> — Anyone can submit servers, propose edits, and add context that machines can&apos;t.</li>
            <li><strong className="text-text-primary">Editors verify</strong> — Experienced contributors review changes to ensure quality.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Contributing</h2>
          <p className="mb-3">There are several ways to contribute:</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border">
              <thead>
                <tr className="bg-bg-secondary">
                  <th className="text-left px-3 py-2 border-b border-border font-medium">Role</th>
                  <th className="text-left px-3 py-2 border-b border-border font-medium">Can do</th>
                  <th className="text-left px-3 py-2 border-b border-border font-medium">How to earn</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border-b border-border">Reader</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">Browse, search, copy configs</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">No login needed</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border-b border-border">Contributor</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">Submit servers, post discussions, propose edits</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">Sign in with GitHub</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border-b border-border">Editor</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">Approve edits, moderate discussions</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">10+ approved edits</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border-b border-border">Maintainer</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">Manage categories, feature servers</td>
                  <td className="px-3 py-2 border-b border-border text-text-muted">By invitation</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Principles</h2>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li><strong className="text-text-primary">Completeness over curation</strong> — Every server belongs here.</li>
            <li><strong className="text-text-primary">Zero friction to read</strong> — No login walls. No popups.</li>
            <li><strong className="text-text-primary">Machines maintain, humans improve</strong> — Bots keep data fresh. Community adds context.</li>
            <li><strong className="text-text-primary">Clean and fast</strong> — Information-dense, scannable, beautiful through clarity.</li>
            <li><strong className="text-text-primary">Non-profit ethos</strong> — Community-owned knowledge. Transparent operations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Open source</h2>
          <p>
            MCPpedia is fully open source. View the code, report issues, and contribute on{' '}
            <a href="https://github.com/mcppedia/mcppedia" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
              GitHub
            </a>.
          </p>
        </section>

        <section className="pt-4 border-t border-border">
          <p className="text-text-muted">
            Have questions? <Link href="/submit" className="text-accent hover:text-accent-hover">Submit a server</Link>,
            join a <Link href="/servers" className="text-accent hover:text-accent-hover">discussion</Link>,
            or open an issue on GitHub.
          </p>
        </section>
      </div>
    </div>
  )
}
