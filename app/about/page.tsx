import type { Metadata } from 'next'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'

export const revalidate = 86400

export const metadata: Metadata = {
  title: 'About',
  description: 'MCPpedia is the free, open, community-driven encyclopedia for MCP servers. Every server scored on security, maintenance, and efficiency.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'}/about` },
}

export default async function AboutPage() {
  const supabase = createPublicClient()
  const { count: serverCount } = await supabase
    .from('servers')
    .select('*', { count: 'exact', head: true })
    .eq('is_archived', false)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">About MCPpedia</h1>

      <div className="space-y-8 text-sm text-text-primary leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">What MCPpedia does</h2>
          <p>
            MCPpedia tracks every MCP server we can find and scores each one on security, maintenance,
            efficiency, documentation, and compatibility. The goal: help developers find the right server
            and know if it&apos;s safe before they install it.
          </p>
          <p className="mt-2 text-text-muted">
            It&apos;s free to use, open source, and has no login walls.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">How it works</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="text-accent font-bold shrink-0 w-5">1.</span>
              <div>
                <strong>Discover.</strong>
                <span className="text-text-muted"> Bots search the official MCP Registry, GitHub, and npm daily for new servers. Currently tracking <strong className="text-text-primary">{(serverCount || 0).toLocaleString()}</strong> servers and counting.</span>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-accent font-bold shrink-0 w-5">2.</span>
              <div>
                <strong>Enrich.</strong>
                <span className="text-text-muted"> GitHub metadata (stars, commits, license), npm downloads, tool schemas, install configs, and descriptions are pulled automatically.</span>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-accent font-bold shrink-0 w-5">3.</span>
              <div>
                <strong>Scan.</strong>
                <span className="text-text-muted"> Every server is checked daily against </span>
                <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">OSV.dev</a>
                <span className="text-text-muted"> for known CVEs. Results are transparent &mdash; you can verify every claim.</span>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-accent font-bold shrink-0 w-5">4.</span>
              <div>
                <strong>Score.</strong>
                <span className="text-text-muted"> Each server gets a 0&ndash;100 score based on real data: security (30pts), maintenance (25pts), efficiency (20pts), documentation (15pts), compatibility (10pts). </span>
                <Link href="/methodology" className="text-accent hover:text-accent-hover">Full methodology &rarr;</Link>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">What makes it different</h2>
          <ul className="space-y-2 text-text-muted">
            <li><strong className="text-text-primary">Scored, not just listed.</strong> Every server has a transparent score computed from real data. No manual overrides.</li>
            <li><strong className="text-text-primary">Security first.</strong> CVE scanning on every server, every day. You see exactly which servers have vulnerabilities and which are clean.</li>
            <li><strong className="text-text-primary">Copy-paste install.</strong> Install configs ready for Claude Desktop, Cursor, and Claude Code. No guessing.</li>
            <li><strong className="text-text-primary">Open and verifiable.</strong> The scoring algorithm is <a href="https://github.com/BbekShr/MCPpedia/blob/main/lib/scoring.ts" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">open source</a>. Every data point links to its source (OSV.dev, GitHub, npm).</li>
            <li><strong className="text-text-primary">Community-driven.</strong> Anyone can submit servers, propose edits, write reviews, and verify health checks.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Data sources</h2>
          <ul className="space-y-1 text-text-muted">
            <li><strong className="text-text-primary">Official MCP Registry</strong> &mdash; registry.modelcontextprotocol.io</li>
            <li><strong className="text-text-primary">GitHub API</strong> &mdash; stars, commits, issues, license, README</li>
            <li><strong className="text-text-primary">npm Registry</strong> &mdash; weekly downloads, package metadata</li>
            <li><strong className="text-text-primary">OSV.dev</strong> &mdash; CVE scanning (Google&apos;s open vulnerability database)</li>
            <li><strong className="text-text-primary">Community</strong> &mdash; user submissions, edit proposals, reviews, health reports</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Principles</h2>
          <ul className="space-y-1 text-text-muted">
            <li><strong className="text-text-primary">Transparency over trust</strong> &mdash; every score is verifiable. Click through to the source.</li>
            <li><strong className="text-text-primary">Safety over convenience</strong> &mdash; security is weighted heaviest in scoring.</li>
            <li><strong className="text-text-primary">Completeness over curation</strong> &mdash; every server belongs here, but the scoring surfaces the best.</li>
            <li><strong className="text-text-primary">Zero friction</strong> &mdash; no login walls, no popups, no ads.</li>
            <li><strong className="text-text-primary">Independent</strong> &mdash; not affiliated with Anthropic or any server listed here.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Open source</h2>
          <p className="text-text-muted">
            MCPpedia is open source. The code, scoring algorithm, and bots are all public.
          </p>
          <div className="flex gap-4 mt-3">
            <a href="https://github.com/BbekShr/MCPpedia" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover font-medium">
              GitHub &rarr;
            </a>
            <Link href="/methodology" className="text-accent hover:text-accent-hover font-medium">
              Scoring methodology &rarr;
            </Link>
            <Link href="/security" className="text-accent hover:text-accent-hover font-medium">
              Security advisories &rarr;
            </Link>
          </div>
        </section>

        <section className="pt-4 border-t border-border">
          <p className="text-text-muted">
            Questions or feedback?{' '}
            <a href="https://github.com/BbekShr/MCPpedia/issues" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">Open an issue</a>,{' '}
            <Link href="/submit" className="text-accent hover:text-accent-hover">submit a server</Link>, or{' '}
            browse the <Link href="/servers" className="text-accent hover:text-accent-hover">directory</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
