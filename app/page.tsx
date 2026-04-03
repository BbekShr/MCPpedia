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
  ] = await Promise.all([
    supabase
      .from('servers')
      .select('*')
      .neq('is_archived', true)
      .order('updated_at', { ascending: false })
      .limit(4),
    supabase
      .from('servers')
      .select('*')
      .neq('source', 'manual')
      .neq('is_archived', true)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('servers')
      .select('*')
      .eq('author_type', 'official')
      .neq('is_archived', true)
      .order('score_total', { ascending: false })
      .limit(8),
    supabase
      .from('servers')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', false),
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

      {/* Official MCP Servers */}
      {officialServers && officialServers.length > 0 && (
        <section>
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

    </div>
  )
}
