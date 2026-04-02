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
    { data: officialServers },
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
      .select('*')
      .eq('author_type', 'official')
      .order('score_total', { ascending: false })
      .limit(8),
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
      <section className="border-b border-border" style={{ background: 'var(--hero-gradient)' }}>
        <div className="max-w-[1200px] mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-bold text-text-primary mb-3 tracking-tight">
            The trusted source for<br />MCP servers
          </h1>
          <p className="text-lg text-text-muted mb-8 max-w-lg mx-auto">
            Scored on security, maintenance, and efficiency. Verified by real data, not opinions.
          </p>
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
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center gap-5 text-sm text-text-muted">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            {serverCount || 0} servers
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {contributorCount || 0} contributors
          </span>
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
              { href: '/best-for/developers', label: 'Developers', color: 'border-l-accent', icon: '</>' },
              { href: '/best-for/data-engineering', label: 'Data Engineering', color: 'border-l-green', icon: 'DB' },
              { href: '/best-for/productivity', label: 'Productivity', color: 'border-l-yellow', icon: 'ZZ' },
              { href: '/best-for/ai-agents', label: 'AI Agents', color: 'border-l-accent', icon: 'AI' },
              { href: '/best-for/cloud-infrastructure', label: 'Cloud & Infra', color: 'border-l-green', icon: 'CL' },
              { href: '/best-for/security', label: 'Security', color: 'border-l-red', icon: 'SC' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`border border-border border-l-[3px] ${item.color} rounded-md p-4 text-sm hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px] transition-all`}
              >
                <span className="text-xs font-mono font-bold text-text-muted block mb-1">{item.icon}</span>
                <span className="font-medium text-text-primary">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Official MCP Servers */}
      {officialServers && officialServers.length > 0 && (
        <section className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Official MCP Servers</h2>
                <p className="text-xs text-text-muted">Built and maintained by the service providers themselves</p>
              </div>
              <Link href="/servers?author=official" className="text-sm text-accent hover:text-accent-hover">
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(officialServers as Server[]).map(server => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Guides */}
      <section className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Guides</h2>
          <div className="space-y-3">
            {[
              { href: '/guides/what-is-mcp', title: 'What is MCP? A beginner\'s guide', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
              { href: '/guides/install-first-server', title: 'How to install your first MCP server', icon: 'M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4' },
              { href: '/guides/best-servers-2026', title: 'Best MCP servers for developers in 2026', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 0 0 .95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 0 0-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 0 0-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 0 0-.363-1.118L2.98 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 0 0 .951-.69l1.519-4.674z' },
            ].map(guide => (
              <Link
                key={guide.href}
                href={guide.href}
                className="flex items-center gap-3 p-3 rounded-md hover:bg-bg-tertiary transition-colors group"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted group-hover:text-accent shrink-0 transition-colors">
                  <path d={guide.icon} />
                </svg>
                <span className="text-sm text-accent group-hover:text-accent-hover">{guide.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
