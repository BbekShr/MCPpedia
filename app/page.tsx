import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import SearchBar from '@/components/SearchBar'
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/constants'
import type { Server } from '@/lib/types'
import type { Category } from '@/lib/constants'

export const revalidate = 60

export default async function HomePage() {
  const supabase = await createClient()

  const [
    { data: recentlyUpdated },
    { data: newlyDiscovered },
    { count: serverCount },
    { count: contributorCount },
  ] = await Promise.all([
    supabase
      .from('servers')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(4),
    supabase
      .from('servers')
      .select('*')
      .neq('source', 'manual')
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('servers')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true }),
  ])

  return (
    <div>
      {/* Hero */}
      <section className="bg-bg-secondary border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-semibold text-text-primary mb-2">MCPpedia</h1>
          <p className="text-text-muted mb-8">The encyclopedia of MCP servers</p>
          <div className="max-w-xl mx-auto mb-6">
            <SearchBar
              placeholder={`Search ${serverCount || 0}+ MCP servers...`}
              large
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {CATEGORIES.slice(0, 10).map(cat => (
              <Link
                key={cat}
                href={`/category/${cat}`}
                className="px-3 py-1 text-sm rounded-full border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-150"
              >
                {CATEGORY_LABELS[cat as Category]}
              </Link>
            ))}
            <Link
              href="/servers"
              className="px-3 py-1 text-sm rounded-full text-accent hover:text-accent-hover transition-colors duration-150"
            >
              All &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center gap-4 text-sm text-text-muted">
          <span>{serverCount || 0} servers</span>
          <span>&middot;</span>
          <span>{contributorCount || 0} contributors</span>
        </div>
      </section>

      {/* Beginner CTA */}
      <section className="bg-accent/5 border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">New to MCP?</p>
            <p className="text-xs text-text-muted">Learn what MCP servers are and set up your first one in 2 minutes.</p>
          </div>
          <Link
            href="/get-started"
            className="shrink-0 px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Recently updated */}
      <section className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Recently updated</h2>
          <Link href="/servers?sort=newest" className="text-sm text-accent hover:text-accent-hover">
            View all &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(recentlyUpdated as Server[] || []).map(server => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
        {(!recentlyUpdated || recentlyUpdated.length === 0) && (
          <p className="text-text-muted text-sm">No servers yet. <Link href="/submit" className="text-accent">Submit the first one!</Link></p>
        )}
      </section>

      {/* Newly discovered */}
      {newlyDiscovered && newlyDiscovered.length > 0 && (
        <section className="max-w-[1200px] mx-auto px-4 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Newly discovered</h2>
            <Link href="/servers?sort=newest" className="text-sm text-accent hover:text-accent-hover">
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(newlyDiscovered as Server[]).map(server => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        </section>
      )}

      {/* Best for use cases */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Best MCP servers for...</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { href: '/best-for/developers', label: 'Developers', emoji: '&lt;/&gt;' },
              { href: '/best-for/data-engineering', label: 'Data Engineering', emoji: '&#128202;' },
              { href: '/best-for/productivity', label: 'Productivity', emoji: '&#9889;' },
              { href: '/best-for/ai-agents', label: 'AI Agents', emoji: '&#129302;' },
              { href: '/best-for/cloud-infrastructure', label: 'Cloud & Infra', emoji: '&#9729;' },
              { href: '/best-for/security', label: 'Security', emoji: '&#128274;' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="border border-border rounded-md p-3 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                dangerouslySetInnerHTML={{ __html: `${item.emoji} ${item.label}` }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Guides */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Guides</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/guides/what-is-mcp" className="text-accent hover:text-accent-hover">
                What is MCP? A beginner&apos;s guide
              </Link>
            </li>
            <li>
              <Link href="/guides/install-first-server" className="text-accent hover:text-accent-hover">
                How to install your first MCP server
              </Link>
            </li>
            <li>
              <Link href="/guides/best-servers-2026" className="text-accent hover:text-accent-hover">
                Best MCP servers for developers in 2026
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
