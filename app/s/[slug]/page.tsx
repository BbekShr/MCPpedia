import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import HealthBadge from '@/components/HealthBadge'
import CategoryTag from '@/components/CategoryTag'
import ToolCard from '@/components/ToolCard'
import InstallConfig from '@/components/InstallConfig'
import DiscussionSection from '@/components/DiscussionSection'
import { SITE_NAME } from '@/lib/constants'
import type { Server, Changelog } from '@/lib/types'
import type { HealthStatus } from '@/lib/constants'
import type { Metadata } from 'next'

export const revalidate = 60

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: server } = await supabase
    .from('servers')
    .select('name, tagline, tools, categories')
    .eq('slug', slug)
    .single()

  if (!server) return { title: 'Server Not Found' }

  const toolCount = (server.tools as unknown[])?.length || 0

  return {
    title: `${server.name} - ${SITE_NAME}`,
    description: server.tagline
      ? `${server.tagline}. ${toolCount} tools. Compatible with Claude Desktop, Cursor, and Claude Code.`
      : `${server.name} MCP Server. ${toolCount} tools.`,
  }
}

export async function generateStaticParams() {
  // Skip static generation if Supabase isn't configured
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return []
  }

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('servers')
      .select('slug')
      .order('github_stars', { ascending: false })
      .limit(100)

    return (data || []).map(s => ({ slug: s.slug }))
  } catch {
    return []
  }
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: server } = await supabase
    .from('servers')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!server) notFound()

  const s = server as Server

  const { data: changelogs } = await supabase
    .from('changelogs')
    .select('*')
    .eq('server_id', s.id)
    .order('detected_at', { ascending: false })
    .limit(10)

  const tools = s.tools || []
  const resources = s.resources || []
  const prompts = s.prompts || []

  const sections = [
    { id: 'install', label: 'Quick Install' },
    tools.length > 0 ? { id: 'tools', label: `Tools (${tools.length})` } : null,
    resources.length > 0 ? { id: 'resources', label: 'Resources' } : null,
    prompts.length > 0 ? { id: 'prompts', label: 'Prompts' } : null,
    s.description ? { id: 'about', label: 'About' } : null,
    s.api_name ? { id: 'api-info', label: 'API Info' } : null,
    changelogs && changelogs.length > 0 ? { id: 'versions', label: 'Version History' } : null,
    { id: 'discussion', label: 'Discussion' },
  ].filter(Boolean) as { id: string; label: string }[]

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">{s.name}</h1>
        {s.tagline && (
          <p className="text-text-muted mb-3">{s.tagline}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {s.author_type === 'official' && (
            <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">Official</span>
          )}
          {s.author_type === 'community' && (
            <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-medium">Community</span>
          )}
          <HealthBadge status={s.health_status as HealthStatus} />
          {s.updated_at && (
            <span className="text-xs text-text-muted">
              Updated {new Date(s.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
        {s.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {s.categories.map(cat => (
              <CategoryTag key={cat} category={cat} />
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted mb-4">
          {s.github_stars > 0 && <span>&#9733; {formatNumber(s.github_stars)}</span>}
          {s.npm_weekly_downloads > 0 && <span>&#8595; {formatNumber(s.npm_weekly_downloads)}/wk</span>}
        </div>

        {/* External links */}
        <div className="flex flex-wrap items-center gap-3">
          {s.github_url && (
            <a href={s.github_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover">
              GitHub
            </a>
          )}
          {s.npm_package && (
            <a href={`https://www.npmjs.com/package/${s.npm_package}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover">
              npm
            </a>
          )}
          {s.pip_package && (
            <a href={`https://pypi.org/project/${s.pip_package}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover">
              PyPI
            </a>
          )}
          {s.homepage_url && (
            <a href={s.homepage_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover">
              Homepage
            </a>
          )}
          <div className="flex-1" />
          <Link href={`/s/${slug}/edit`} className="text-sm text-text-muted hover:text-text-primary border border-border rounded-md px-3 py-1 transition-colors duration-150">
            Edit this page
          </Link>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-8">
        {/* Sidebar TOC — hidden on mobile */}
        <aside className="hidden lg:block w-48 shrink-0">
          <nav className="sticky top-20 space-y-1">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">On this page</div>
            {sections.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block text-sm text-text-muted hover:text-text-primary py-0.5 transition-colors duration-150"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-10">
          {/* Quick Install */}
          <section id="install">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Install</h2>
            <InstallConfig
              configs={s.install_configs as Record<string, unknown>}
              compatibleClients={s.compatible_clients}
              serverName={s.name}
            />
          </section>

          {/* Tools */}
          {tools.length > 0 && (
            <section id="tools">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Tools ({tools.length})</h2>
              <div className="space-y-2">
                {tools.slice(0, 10).map(tool => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
              {tools.length > 10 && (
                <ToolsExpander tools={tools} />
              )}
            </section>
          )}

          {/* Resources */}
          {resources.length > 0 && (
            <section id="resources">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Resources ({resources.length})</h2>
              <div className="space-y-2">
                {resources.map(r => (
                  <div key={r.name} className="border border-border rounded-md p-3">
                    <code className="text-sm font-mono font-medium text-text-primary">{r.name}</code>
                    {r.description && <p className="text-sm text-text-muted mt-0.5">{r.description}</p>}
                    {r.uri_template && <p className="text-xs text-text-muted mt-1 font-mono">{r.uri_template}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Prompts */}
          {prompts.length > 0 && (
            <section id="prompts">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Prompts ({prompts.length})</h2>
              <div className="space-y-2">
                {prompts.map(p => (
                  <div key={p.name} className="border border-border rounded-md p-3">
                    <code className="text-sm font-mono font-medium text-text-primary">{p.name}</code>
                    {p.description && <p className="text-sm text-text-muted mt-0.5">{p.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* About */}
          {s.description && (
            <section id="about">
              <h2 className="text-lg font-semibold text-text-primary mb-4">About</h2>
              <div className="prose prose-sm max-w-none text-text-primary">
                <p className="whitespace-pre-wrap">{s.description}</p>
              </div>
            </section>
          )}

          {/* API Info */}
          {s.api_name && (
            <section id="api-info">
              <h2 className="text-lg font-semibold text-text-primary mb-4">API Info</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex gap-4">
                  <dt className="text-text-muted w-28 shrink-0">API</dt>
                  <dd className="text-text-primary">{s.api_name}</dd>
                </div>
                {s.api_pricing && s.api_pricing !== 'unknown' && (
                  <div className="flex gap-4">
                    <dt className="text-text-muted w-28 shrink-0">Pricing</dt>
                    <dd className="text-text-primary capitalize">{s.api_pricing}</dd>
                  </div>
                )}
                {s.api_rate_limits && (
                  <div className="flex gap-4">
                    <dt className="text-text-muted w-28 shrink-0">Rate limits</dt>
                    <dd className="text-text-primary">{s.api_rate_limits}</dd>
                  </div>
                )}
                <div className="flex gap-4">
                  <dt className="text-text-muted w-28 shrink-0">Auth required</dt>
                  <dd className="text-text-primary">{s.requires_api_key ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* Version History */}
          {changelogs && changelogs.length > 0 && (
            <section id="versions">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Version History</h2>
              <div className="space-y-3">
                {(changelogs as Changelog[]).map(cl => (
                  <div key={cl.id} className="flex items-start gap-3 text-sm">
                    <span className="font-mono text-text-primary shrink-0">{cl.version || 'unknown'}</span>
                    <span className="text-text-muted">
                      ({new Date(cl.detected_at).toLocaleDateString()})
                    </span>
                    {cl.changes_summary && (
                      <span className="text-text-muted">&mdash; {cl.changes_summary}</span>
                    )}
                    {cl.github_release_url && (
                      <a href={cl.github_release_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover shrink-0">
                        Release
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Discussion */}
          <section id="discussion">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Discussion</h2>
            <DiscussionSection serverId={s.id} />
          </section>
        </div>
      </div>
    </div>
  )
}

// Client component for expanding tools list
function ToolsExpander({ tools }: { tools: Server['tools'] }) {
  return <ToolsExpanderClient tools={tools} />
}

import ToolsExpanderClient from '@/components/ToolsExpanderClient'
