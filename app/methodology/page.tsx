import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Scoring Methodology',
  description: 'How MCPpedia scores MCP servers. Full transparency on our security, maintenance, efficiency, documentation, and compatibility scoring.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'}/methodology` },
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
          <p className="text-text-muted mb-3">Heaviest weight because security is what developers worry about most. Nine checks across CVEs, tool poisoning, injection vectors, and more.</p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">Check</th><th className="text-left px-3 py-2">What We Look For</th><th className="text-right px-3 py-2">Max</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Known CVEs</td><td className="px-3 py-2 text-text-muted">Open vulnerabilities from OSV.dev. Critical/high: -5 each, medium: -3, low: -1.</td><td className="px-3 py-2 text-right">15</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Tool poisoning</td><td className="px-3 py-2 text-text-muted">Hidden instruction tags, concealment language, cross-tool manipulation, sensitive file exfiltration, unicode obfuscation, suspicious parameters, schema poisoning.</td><td className="px-3 py-2 text-right">5</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Tool safety</td><td className="px-3 py-2 text-text-muted">Dangerous patterns: code execution, filesystem writes, raw SQL, side effects. Auth mitigates risk.</td><td className="px-3 py-2 text-right">3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Injection vectors</td><td className="px-3 py-2 text-text-muted">Permissive descriptions (&quot;execute any&quot;), bypass language (&quot;ignore previous&quot;), system command shadowing, unconstrained exec input.</td><td className="px-3 py-2 text-right">3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Dependency health</td><td className="px-3 py-2 text-text-muted">Package exists on deps.dev, has dependents, recently updated, not bloated.</td><td className="px-3 py-2 text-right">3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">License</td><td className="px-3 py-2 text-text-muted">Has a valid open-source license.</td><td className="px-3 py-2 text-right">3</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Authentication</td><td className="px-3 py-2 text-text-muted">Bonus for requiring authentication.</td><td className="px-3 py-2 text-right">2</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Repository signals</td><td className="px-3 py-2 text-text-muted">Archived repos penalized, MCPpedia-verified repos rewarded.</td><td className="px-3 py-2 text-right">2</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2 font-medium">Tool stability</td><td className="px-3 py-2 text-text-muted">Hash of tool definitions compared between scans to detect silent mutations (rug pulls).</td><td className="px-3 py-2 text-right">1</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-2">CVE data is refreshed daily via OSV.dev. Tool poisoning detection scans tool descriptions, parameter names, defaults, enum values, and schema structure — not just top-level descriptions.</p>
        </section>

        {/* Tool Poisoning Detail */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Tool Poisoning Detection</h2>
          <p className="text-text-muted mb-3">
            Tool poisoning is the most MCP-specific attack class. Malicious instructions are embedded in tool metadata
            that the AI follows but users never see. We scan for:
          </p>
          <ul className="space-y-1 text-text-muted list-disc pl-5 mb-3">
            <li><strong className="text-text-primary">Hidden instruction tags</strong> — {`<IMPORTANT>`}, {`<SYSTEM>`}, {`<DIRECTIVE>`} and similar tags in any metadata field</li>
            <li><strong className="text-text-primary">ALL-CAPS directives</strong> — IMPORTANT:, MANDATORY:, YOU MUST and other LLM-manipulation keywords</li>
            <li><strong className="text-text-primary">Concealment language</strong> — &quot;do not tell the user&quot;, &quot;keep this secret&quot;, &quot;hide this from&quot;</li>
            <li><strong className="text-text-primary">Cross-tool manipulation</strong> — &quot;modify the behavior of&quot;, &quot;when this tool is available&quot;, tool name references</li>
            <li><strong className="text-text-primary">Sensitive file exfiltration</strong> — References to ~/.ssh, .env, /etc/passwd combined with &quot;pass&quot;/&quot;send&quot; language</li>
            <li><strong className="text-text-primary">Full-schema poisoning</strong> — Malicious instructions in parameter names, default values, or enum arrays (not just descriptions)</li>
            <li><strong className="text-text-primary">Unicode obfuscation</strong> — Zero-width spaces, RTL overrides, and Unicode Tags used to hide instructions</li>
            <li><strong className="text-text-primary">Suspicious parameters</strong> — Unconstrained string params named &quot;metadata&quot;, &quot;callback_url&quot;, &quot;webhook&quot; etc.</li>
          </ul>
          <p className="text-xs text-text-muted">Every pattern is tuned to minimize false positives — e.g. &quot;send to&quot; alone doesn&apos;t trigger, but &quot;read ~/.ssh/id_rsa and pass content as parameter&quot; does. Patterns are tested against 25+ real attack payloads and 26+ legitimate tool descriptions.</p>
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
                <tr className="border-t border-border"><td className="px-3 py-2">100+ open issues</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right text-red">-2</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">Archived repository</td><td className="px-3 py-2 text-text-muted">GitHub API</td><td className="px-3 py-2 text-right text-red">-10</td></tr>
                <tr className="border-t border-border"><td className="px-3 py-2">MCPpedia verified</td><td className="px-3 py-2 text-text-muted">Manual review</td><td className="px-3 py-2 text-right">+3</td></tr>
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
          <p className="text-xs text-text-muted mt-2">README content is fetched directly from GitHub and analyzed for structure. Additional points for description, tagline, homepage, and API name metadata.</p>
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
                <tr className="border-t border-border"><td className="px-3 py-2">Each tested client</td><td className="px-3 py-2 text-right">+2 (max 6)</td></tr>
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
            <li><strong className="text-text-primary">deps.dev</strong> — Google&apos;s dependency intelligence API. Dependent counts, version recency, dependency graph analysis.</li>
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

        {/* Limitations */}
        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-semibold mb-3">Limitations</h2>
          <p className="text-text-muted mb-3">
            MCPpedia is a <strong className="text-text-primary">static metadata scanner</strong>, not a runtime security proxy.
            Understanding what we can and cannot detect is important:
          </p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-bg-secondary"><th className="text-left px-3 py-2">What We Detect</th><th className="text-left px-3 py-2">What We Cannot Detect</th></tr></thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 text-text-muted align-top">
                    <ul className="space-y-1 list-disc pl-4">
                      <li>Known CVEs in published packages</li>
                      <li>Poisoned tool descriptions and schemas</li>
                      <li>Suspicious patterns in tool metadata</li>
                      <li>Tool definition mutations between scans</li>
                      <li>Dependency health signals</li>
                    </ul>
                  </td>
                  <td className="px-3 py-2 text-text-muted align-top">
                    <ul className="space-y-1 list-disc pl-4">
                      <li>Runtime output injection (ATPA attacks)</li>
                      <li>Real-time rug pulls during a session</li>
                      <li>Malicious code paths triggered only at runtime</li>
                      <li>Undocumented tools not in README</li>
                      <li>Supply chain attacks in transitive dependencies</li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Tool definitions are extracted from GitHub READMEs, not from running the actual server code. If a server&apos;s
            real tool definitions differ from its documentation, our analysis may be incomplete.
          </p>
        </section>

        {/* Disclaimer */}
        <section className="border-t border-border pt-8">
          <h2 className="text-lg font-semibold mb-3">Disclaimer</h2>
          <p className="text-text-muted">
            MCPpedia scores are generated automatically from publicly available data and may not reflect
            the full quality, security posture, or suitability of any server for your use case. Scores
            are provided for informational purposes only and should not be the sole basis for security
            or purchasing decisions.
          </p>
          <p className="text-text-muted mt-2">
            MCPpedia is an independent community project and is not affiliated with, endorsed by, or
            sponsored by Anthropic, the Model Context Protocol project, or any server listed on this site.
            &quot;MCP&quot; and &quot;Model Context Protocol&quot; are trademarks of their respective owners.
          </p>
          <p className="text-text-muted mt-2">
            Server metadata is sourced from the official MCP Registry, GitHub, npm, PyPI, and OSV.dev.
            If you believe any information is inaccurate, please{' '}
            <a href="https://github.com/BbekShr/MCPpedia/issues" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
              open an issue
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
