import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Scoring Methodology',
  description: 'How MCPpedia scores MCP servers. Full transparency on our security, maintenance, efficiency, documentation, and compatibility scoring.',
}

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">Scoring Methodology</h1>
      <p className="text-text-muted mb-8">
        Every MCPpedia Score is computed from real, verifiable data. No manual overrides. Full transparency.
      </p>

      <div className="space-y-10 text-sm text-text-primary leading-relaxed">
        {/* Security */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Security — 30 points</h2>
          <p className="text-text-muted mb-3">Heaviest weight because security is what developers worry about most.</p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">Signal</th><th className="text-left px-3 py-2">Source</th><th className="text-right px-3 py-2">Impact</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-3 py-2">Known CVEs</td><td className="px-3 py-2 text-text-muted">OSV.dev API (Google&apos;s open vulnerability database)</td><td className="px-3 py-2 text-right text-red">-10 per critical/high</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Medium severity CVEs</td><td className="px-3 py-2 text-text-muted">OSV.dev API</td><td className="px-3 py-2 text-right text-red">-5 each</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">No authentication</td><td className="px-3 py-2 text-text-muted">Server metadata</td><td className="px-3 py-2 text-right text-red">-4</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">No license</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right text-red">-3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Archived repo</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right text-red">-8</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">MCPpedia verified</td><td className="px-3 py-2 text-text-muted">Manual review</td><td className="px-3 py-2 text-right text-green">+5</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-2">CVE data is refreshed daily. We query every npm and PyPI package against OSV.dev.</p>
        </section>

        {/* Maintenance */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Maintenance — 25 points</h2>
          <p className="text-text-muted mb-3">Is this server actively developed? Will bugs get fixed?</p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">Signal</th><th className="text-left px-3 py-2">Source</th><th className="text-right px-3 py-2">Points</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-3 py-2">Commit in last 7 days</td><td className="px-3 py-2 text-text-muted">GitHub API (pushed_at)</td><td className="px-3 py-2 text-right">+12</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Commit in last 30 days</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right">+10</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Commit in last 90 days</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right">+7</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">5,000+ GitHub stars</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right">+5</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">10,000+ weekly npm downloads</td><td className="px-3 py-2 text-text-muted">npm registry API</td><td className="px-3 py-2 text-right">+5</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-2">GitHub and npm data is refreshed daily.</p>
        </section>

        {/* Efficiency */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Efficiency — 20 points</h2>
          <p className="text-text-muted mb-3">How much of your AI&apos;s context window does this server consume?</p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">Total Tool Token Cost</th><th className="text-left px-3 py-2">Grade</th><th className="text-right px-3 py-2">Points</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-3 py-2">&le; 500 tokens</td><td className="px-3 py-2 text-green">A</td><td className="px-3 py-2 text-right">20</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">&le; 1,500 tokens</td><td className="px-3 py-2 text-green">B</td><td className="px-3 py-2 text-right">16</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">&le; 4,000 tokens</td><td className="px-3 py-2 text-yellow">C</td><td className="px-3 py-2 text-right">12</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">&le; 8,000 tokens</td><td className="px-3 py-2 text-red">D</td><td className="px-3 py-2 text-right">6</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">&gt; 8,000 tokens</td><td className="px-3 py-2 text-red">F</td><td className="px-3 py-2 text-right">2</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Token cost is measured by serializing each tool&apos;s name, description, and input schema to JSON and dividing by ~3.5 characters per token. This is the actual context cost when a client loads the server.
          </p>
        </section>

        {/* Documentation */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Documentation — 15 points</h2>
          <p className="text-text-muted mb-3">Can a developer actually set this up without guessing?</p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">Signal</th><th className="text-left px-3 py-2">How We Check</th><th className="text-right px-3 py-2">Points</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-3 py-2">All tools have descriptions</td><td className="px-3 py-2 text-text-muted">Check description.length &gt; 10</td><td className="px-3 py-2 text-right">+5</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Tools have input schemas</td><td className="px-3 py-2 text-text-muted">Check schema has properties</td><td className="px-3 py-2 text-right">+3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Install configs provided</td><td className="px-3 py-2 text-text-muted">Check install_configs non-empty</td><td className="px-3 py-2 text-right">+3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">README has setup instructions</td><td className="px-3 py-2 text-text-muted">Scan for &quot;install&quot;, &quot;setup&quot;, &quot;getting started&quot;</td><td className="px-3 py-2 text-right">+2</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">README has code examples</td><td className="px-3 py-2 text-text-muted">Scan for code blocks and &quot;example&quot;</td><td className="px-3 py-2 text-right">+2</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-2">README content is fetched directly from GitHub and analyzed for structure.</p>
        </section>

        {/* Compatibility */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Compatibility — 10 points</h2>
          <p className="text-text-muted mb-3">Which clients and transports does it support?</p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">Signal</th><th className="text-right px-3 py-2">Points</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-3 py-2">Supports stdio transport</td><td className="px-3 py-2 text-right">+4</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Supports HTTP/SSE transport</td><td className="px-3 py-2 text-right">+4</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Multiple transports</td><td className="px-3 py-2 text-right">+2</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Data sources */}
        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-semibold mb-3">Data Sources</h2>
          <ul className="space-y-2 text-text-muted">
            <li><strong className="text-text-primary">OSV.dev</strong> — Google&apos;s open-source vulnerability database. Aggregates CVE data from GitHub Advisories, NVD, and ecosystem-specific sources.</li>
            <li><strong className="text-text-primary">GitHub API</strong> — Stars, last commit date, open issues, archived status, README content, releases.</li>
            <li><strong className="text-text-primary">npm Registry API</strong> — Weekly download counts, latest version.</li>
            <li><strong className="text-text-primary">Official MCP Registry</strong> — Canonical server metadata from registry.modelcontextprotocol.io.</li>
          </ul>
        </section>

        {/* Update frequency */}
        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-semibold mb-3">Update Frequency</h2>
          <ul className="space-y-1 text-text-muted">
            <li>Scores are recomputed <strong className="text-text-primary">daily at 5:00 UTC</strong></li>
            <li>GitHub/npm metadata refreshed <strong className="text-text-primary">daily at 3:00 UTC</strong></li>
            <li>CVE data checked <strong className="text-text-primary">daily at 5:00 UTC</strong></li>
            <li>New servers discovered <strong className="text-text-primary">daily at 1:00-2:00 UTC</strong></li>
          </ul>
        </section>

        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-semibold mb-3">No Manual Overrides</h2>
          <p className="text-text-muted">
            Scores are computed entirely by algorithm. No server author, sponsor, or MCPpedia team member
            can manually change a score. The only way to improve a score is to improve the server:
            fix CVEs, add documentation, maintain the code, and support more transports.
          </p>
          <p className="text-text-muted mt-2">
            The scoring algorithm itself is open source. You can audit it at{' '}
            <a href="https://github.com/BbekShr/MCPpedia/blob/main/lib/scoring.ts" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
              lib/scoring.ts
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
