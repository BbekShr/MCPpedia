import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import HealthBadge from '@/components/HealthBadge'
import CategoryTag from '@/components/CategoryTag'
import ToolsList from '@/components/ToolsList'
import InstallConfig from '@/components/InstallConfig'
import DiscussionSection from '@/components/DiscussionSection'
import ScoreCard from '@/components/ScoreCard'
import SecurityCard from '@/components/SecurityCard'
import TokenMetrics from '@/components/TokenMetrics'
import HealthCheckBadge from '@/components/HealthCheckBadge'
import VerifiedBadge from '@/components/VerifiedBadge'
import ReviewSection from '@/components/ReviewSection'
import ServerTester from '@/components/ServerTester'
import ServerIcon from '@/components/ServerIcon'
import EnvInstructions from '@/components/EnvInstructions'
import CommunityVerify from '@/components/CommunityVerify'
import { SITE_NAME } from '@/lib/constants'
import type { Server, Changelog, SecurityAdvisory } from '@/lib/types'
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
    .select('name, tagline, tools, categories, score_total')
    .eq('slug', slug)
    .single()

  if (!server) return { title: 'Server Not Found' }

  const toolCount = (server.tools as unknown[])?.length || 0
  const score = server.score_total || 0
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'

  const title = `${server.name} — MCPpedia Score: ${score}/100 (${grade})`
  const description = server.tagline
    ? `${server.tagline}. ${toolCount} tools. Scored on security, maintenance, and efficiency.`
    : `${server.name} MCP Server. ${toolCount} tools. Score: ${score}/100.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
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

  const [{ data: changelogs }, { data: advisories }] = await Promise.all([
    supabase
      .from('changelogs')
      .select('*')
      .eq('server_id', s.id)
      .order('detected_at', { ascending: false })
      .limit(10),
    supabase
      .from('security_advisories')
      .select('*')
      .eq('server_id', s.id)
      .order('published_at', { ascending: false }),
  ])

  const tools = s.tools || []
  const resources = s.resources || []
  const prompts = s.prompts || []

  const sections = [
    { id: 'score', label: 'MCPpedia Score' },
    { id: 'about', label: 'Should You Use It?' },
    { id: 'install', label: 'Quick Install' },
    { id: 'test', label: 'Test It' },
    { id: 'security', label: 'Security' },
    tools.length > 0 ? { id: 'tools', label: `Tools (${tools.length})` } : null,
    resources.length > 0 ? { id: 'resources', label: 'Resources' } : null,
    prompts.length > 0 ? { id: 'prompts', label: 'Prompts' } : null,
    s.api_name ? { id: 'api-info', label: 'API Info' } : null,
    changelogs && changelogs.length > 0 ? { id: 'versions', label: 'Version History' } : null,
    { id: 'reviews', label: 'Reviews' },
    { id: 'discussion', label: 'Discussion' },
  ].filter(Boolean) as { id: string; label: string }[]

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {/* Archived banner */}
      {s.is_archived && (
        <div className="mb-6 p-4 rounded-md border border-red bg-red/5">
          <p className="text-sm text-red font-medium">
            This server has been archived and is no longer actively maintained.
          </p>
          <p className="text-xs text-text-muted mt-1">
            The page is preserved for reference. Consider alternatives in the same category.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <ServerIcon
            name={s.name}
            homepageUrl={s.homepage_url}
            authorGithub={s.author_github}
            size={40}
          />
          <h1 className="text-2xl font-semibold text-text-primary">{s.name}</h1>
          {s.github_url && (
            <a href={s.github_url} target="_blank" rel="noopener noreferrer" className="ml-auto text-text-muted hover:text-text-primary transition-colors duration-150" title="View on GitHub">
              <svg viewBox="0 0 16 16" className="w-6 h-6 fill-current" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
          )}
        </div>
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
          <HealthCheckBadge
            status={s.last_health_check_status}
            checkedAt={s.last_health_check_at}
            uptime={s.health_check_uptime || 0}
          />
          {s.publisher_verified && <VerifiedBadge type="publisher" />}
          {s.registry_verified && <VerifiedBadge type="registry" />}
          {s.verified && <VerifiedBadge type="mcppedia" />}
          {s.community_verified && <VerifiedBadge type="community" />}
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

        {/* Stats + links */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
          {s.github_stars > 0 && <span>&#9733; {formatNumber(s.github_stars)}</span>}
          {s.npm_weekly_downloads > 0 && <span>&#8595; {formatNumber(s.npm_weekly_downloads)}/wk</span>}
          {s.npm_package && (
            <a href={`https://www.npmjs.com/package/${s.npm_package}`} target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors duration-150">
              npm
            </a>
          )}
          {s.pip_package && (
            <a href={`https://pypi.org/project/${s.pip_package}`} target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors duration-150">
              PyPI
            </a>
          )}
          <div className="flex-1" />
          <Link href={`/s/${slug}/edit`} className="text-text-muted hover:text-text-primary border border-border rounded-md px-3 py-1 transition-colors duration-150">
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
        <div className="flex-1 min-w-0 space-y-12 [&>section:not(:first-child)]:pt-8 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-border">
          {/* MCPpedia Score + Security + Token Metrics */}
          <section id="score">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ScoreCard server={s} advisories={(advisories as SecurityAdvisory[]) || []} />
              <div className="space-y-4">
                <SecurityCard server={s} advisories={(advisories as SecurityAdvisory[]) || []} />
                <TokenMetrics server={s} />
              </div>
            </div>
            <div className="mt-3 text-xs text-text-muted">
              <a
                href={`https://mcppedia.org/badge/${s.slug}`}
                className="text-accent hover:text-accent-hover"
              >
                Embed this score
              </a>
              {' · '}
              <code className="bg-code-bg px-1 rounded">
                {'[![MCPpedia Score](https://mcppedia.org/badge/' + s.slug + ')](https://mcppedia.org/s/' + s.slug + ')'}
              </code>
            </div>
          </section>

          {/* Should I use this server? */}
          <section id="about">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Should you use this server?</h2>
            <div className="space-y-4 text-sm">
              {(s.description || s.tagline) && (
                <p className="text-text-primary text-base">{s.description || s.tagline}</p>
              )}
              {(() => {
                const openCVEs = advisories?.filter((a: { status: string }) => a.status === 'open').length || 0
                const fixedCVEs = advisories?.filter((a: { status: string }) => a.status === 'fixed').length || 0
                const packageName = s.npm_package || s.pip_package
                const hasTransport = s.transport && s.transport.length > 0
                const daysSinceCommit = s.github_last_commit ? Math.floor((Date.now() - new Date(s.github_last_commit).getTime()) / 86400000) : null
                const healthStatus = s.is_archived ? 'archived' : daysSinceCommit === null ? 'unknown' : daysSinceCommit < 30 ? 'active' : daysSinceCommit < 90 ? 'maintained' : daysSinceCommit < 365 ? 'stale' : 'abandoned'
                const roundedTokens = s.total_tool_tokens ? Math.round(s.total_tool_tokens / 100) * 100 : null
                const scanFailed = s.security_scan_status === 'failed'

                return (
                <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className={`text-lg mt-0.5 ${scanFailed ? 'text-yellow' : openCVEs === 0 ? 'text-green' : 'text-red'}`}>{scanFailed ? '~' : openCVEs === 0 ? '✓' : '✗'}</span>
                  <div>
                    <p className="font-medium text-text-primary">Is it safe?</p>
                    <div className="text-text-muted space-y-1 mt-1">
                      <p>
                        {scanFailed
                          ? 'CVE scan unavailable — could not reach OSV.dev. Safety data may be incomplete.'
                          : openCVEs === 0
                          ? <>
                              {packageName ? `No known CVEs for ${packageName}.` : 'No package registry to scan for CVEs.'}
                              {fixedCVEs > 0 && ` ${fixedCVEs} previously resolved.`}
                            </>
                          : <>{openCVEs} open CVE{openCVEs !== 1 ? 's' : ''}{fixedCVEs > 0 ? ` (${fixedCVEs} fixed)` : ''}.{' '}
                              {s.npm_package ? <a href={`https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(s.npm_package)}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">Verify on OSV.dev &rarr;</a> : s.pip_package ? <a href={`https://osv.dev/list?ecosystem=PyPI&q=${encodeURIComponent(s.pip_package)}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">Verify on OSV.dev &rarr;</a> : null}
                            </>
                        }
                      </p>
                      <p>
                        {s.has_authentication
                          ? 'Requires authentication to connect.'
                          : 'No authentication \u2014 any process on your machine can connect to this server.'}
                      </p>
                      <p>
                        {s.license && s.license !== 'NOASSERTION'
                          ? <>{s.license}.{s.github_url && <>{' '}<a href={`${s.github_url}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">View license &rarr;</a></>}</>
                          : 'License not specified.'}
                      </p>
                      {s.last_security_scan && (
                        <p className="text-xs">
                          Last scanned {Math.floor((Date.now() - new Date(s.last_security_scan).getTime()) / 86400000)} days ago.
                          {Math.floor((Date.now() - new Date(s.last_security_scan).getTime()) / 86400000) > 7 && ' CVE data may be stale.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className={`text-lg mt-0.5 ${healthStatus === 'active' || healthStatus === 'maintained' ? 'text-green' : 'text-yellow'}`}>{healthStatus === 'active' || healthStatus === 'maintained' ? '✓' : '~'}</span>
                  <div>
                    <p className="font-medium text-text-primary">Is it maintained?</p>
                    <p className="text-text-muted">
                      {daysSinceCommit !== null ? `Last commit ${daysSinceCommit} days ago. ` : 'Commit history unknown. '}
                      {s.github_stars > 0 ? `${s.github_stars.toLocaleString()} GitHub stars. ` : ''}
                      {s.npm_weekly_downloads > 0 ? `${s.npm_weekly_downloads.toLocaleString()} weekly downloads.` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className="text-lg mt-0.5 text-accent">i</span>
                  <div>
                    <p className="font-medium text-text-primary">Will it work with my client?</p>
                    <p className="text-text-muted">
                      Transport: {hasTransport ? s.transport!.join(', ') : 'unknown (likely stdio)'}.
                      {s.compatible_clients && s.compatible_clients.length > 0
                        ? ` Works with ${s.compatible_clients.join(', ')}.`
                        : hasTransport && s.transport!.includes('stdio')
                          ? ' Works with Claude Desktop, Cursor, Claude Code, and most MCP clients.'
                          : hasTransport && (s.transport!.includes('http') || s.transport!.includes('sse'))
                            ? ' Remote server — may need mcp-remote proxy for some clients.'
                            : ' Compatibility not confirmed.'}
                      {s.requires_api_key ? ' Requires an API key.' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className={`text-lg mt-0.5 ${s.token_efficiency_grade === 'A' || s.token_efficiency_grade === 'B' ? 'text-green' : s.token_efficiency_grade === 'C' ? 'text-yellow' : 'text-text-muted'}`}>{s.token_efficiency_grade && s.token_efficiency_grade !== 'unknown' ? s.token_efficiency_grade : '?'}</span>
                  <div>
                    <p className="font-medium text-text-primary">How much context will it use?</p>
                    <p className="text-text-muted">
                      {tools.length} tool{tools.length !== 1 ? 's' : ''}.
                      {roundedTokens ? ` Estimated ~${roundedTokens.toLocaleString()} tokens of your context window (${((s.total_tool_tokens / 200000) * 100).toFixed(1)}% of 200K).` : tools.length > 0 ? ` Estimated ~${(Math.round(tools.length * 150 / 100) * 100).toLocaleString()} tokens.` : ' Token cost not measured.'}
                      {tools.length > 20 ? ' Consider loading selectively — this is a heavy server.' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className="text-lg mt-0.5 text-accent">?</span>
                  <div>
                    <p className="font-medium text-text-primary">What if it doesn&apos;t work?</p>
                    <p className="text-text-muted">
                      Common issues: JSON syntax errors in config{s.npm_package ? ', wrong Node.js version, npx cache' : s.pip_package ? ', Python version mismatch' : ''}{s.requires_api_key ? ', missing or expired API key' : ''}{hasTransport && (s.transport!.includes('http') || s.transport!.includes('sse')) ? ', network or firewall blocking' : ''}.
                      {' '}<Link href="/setup" className="text-accent hover:text-accent-hover">Setup guide</Link> covers troubleshooting.
                      {s.github_url && <>{' '}Or check <a href={`${s.github_url}/issues`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">GitHub issues</a> for known problems.</>}
                    </p>
                  </div>
                </div>
                </div>
                )
              })()}
              <div className="pt-3 border-t border-border">
                <CommunityVerify serverId={s.id} initialCount={s.community_verification_count || 0} />
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {s.github_url && (
                  <a href={s.github_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    Full docs on GitHub
                  </a>
                )}
                {s.homepage_url && <a href={s.homepage_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover">Homepage</a>}
                {s.npm_package && <a href={`https://www.npmjs.com/package/${s.npm_package}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-hover">npm</a>}
              </div>
            </div>
          </section>

          {/* Quick Install */}
          <section id="install">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Install</h2>
            <InstallConfig
              configs={s.install_configs as Record<string, unknown>}
              compatibleClients={s.compatible_clients}
              serverName={s.name}
              npmPackage={s.npm_package}
              pipPackage={s.pip_package}
              requiresApiKey={s.requires_api_key}
            />
          </section>

          {/* Test it */}
          {/* Env Instructions — how to get API keys */}
          {s.env_instructions && Object.keys(s.env_instructions).length > 0 && (
            <section id="api-keys">
              <EnvInstructions server={s} />
            </section>
          )}

          {/* Test it */}
          <section id="test">
            <ServerTester server={s} />
          </section>

          {/* Tools */}
          {tools.length > 0 && (
            <section id="tools">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Tools ({tools.length})</h2>
              <ToolsList tools={tools} />
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
          {/* Help improve — shown when page is thin */}
          {!s.description && tools.length === 0 && (!s.install_configs || JSON.stringify(s.install_configs) === '{}') && (
            <section className="border border-accent/20 rounded-md p-5 bg-accent/5">
              <h3 className="font-semibold text-text-primary mb-1">Help improve this page</h3>
              <p className="text-sm text-text-muted mb-3">
                This server is missing description, tools, and install config. If you&apos;ve used it, help the community by adding this info.
              </p>
              <Link
                href={`/s/${slug}/edit`}
                className="inline-block px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Add information
              </Link>
            </section>
          )}

          {/* Reviews */}
          <section id="reviews">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Reviews
              {s.review_count > 0 && <span className="text-sm font-normal text-text-muted ml-2">({s.review_count})</span>}
            </h2>
            <ReviewSection serverId={s.id} />
          </section>

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
