import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import HealthBadge from '@/components/HealthBadge'
import ToolsList from '@/components/ToolsList'
import InstallConfig from '@/components/InstallConfig'
import DiscussionSection from '@/components/DiscussionSection'
import NewsletterSignup from '@/components/NewsletterSignup'
import BadgeEmbed from '@/components/BadgeEmbed'
import ServerFAQ, { buildServerFAQs } from '@/components/ServerFAQ'
import ScoreCard from '@/components/ScoreCard'
import SecurityCard from '@/components/SecurityCard'
import HealthCheckBadge from '@/components/HealthCheckBadge'
import VerifiedBadge from '@/components/VerifiedBadge'
import ReviewSection from '@/components/ReviewSection'
import ServerTester from '@/components/ServerTester'
import ServerIcon from '@/components/ServerIcon'
import EnvInstructions from '@/components/EnvInstructions'
import CommunityVerify from '@/components/CommunityVerify'
import CategoryEditor from '@/components/CategoryEditor'
import ServerSidebar from '@/components/ServerSidebar'
import ServerCard from '@/components/ServerCard'
import ScoreBadge from '@/components/ScoreBadge'
import ServerReadme from '@/components/ServerReadme'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateSoftwareApplicationJsonLd, generateServerJsonLd, generateBreadcrumbJsonLd, generateFAQJsonLd } from '@/lib/seo'
import type { Server, Changelog, SecurityAdvisory } from '@/lib/types'
import type { HealthStatus } from '@/lib/constants'

/** Strip HTML tags from a string, decode common entities, and collapse whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')           // remove tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim()
}
import type { Metadata } from 'next'

export const revalidate = 86400

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

  const nameForTitle = server.name.toLowerCase().includes('mcp') ? server.name : `${server.name} MCP Server`
  const title = `${nameForTitle} — Score: ${score}/100 (${grade})`
  const description = server.tagline
    ? `${server.tagline}. ${toolCount} tools. Scored on security, maintenance, and efficiency.`
    : `${nameForTitle}. ${toolCount} tools. Score: ${score}/100.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/s/${slug}`,
    },
  }
}

export async function generateStaticParams() {
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
    .select(PUBLIC_SERVER_FIELDS)
    .eq('slug', slug)
    .single()

  if (!server) notFound()

  const s = server as Server

  const [{ data: changelogs }, { data: advisories }, { data: similarServers }] = await Promise.all([
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
    supabase
      .from('servers')
      .select(PUBLIC_SERVER_FIELDS)
      .overlaps('categories', s.categories || [])
      .neq('slug', slug)
      .eq('is_archived', false)
      .gt('score_total', 0)
      .order('score_total', { ascending: false })
      .limit(4),
  ])

  const tools = s.tools || []
  const resources = s.resources || []
  const prompts = s.prompts || []
  const faqs = buildServerFAQs(s)
  const openCVEs = advisories?.filter((a: { status: string }) => a.status === 'open').length || 0
  const fixedCVEs = advisories?.filter((a: { status: string }) => a.status === 'fixed').length || 0
  const daysSinceCommit = s.github_last_commit ? Math.floor((Date.now() - new Date(s.github_last_commit).getTime()) / 86400000) : null
  const scanFailed = s.security_scan_status === 'failed'
  const packageName = s.npm_package || s.pip_package
  const hasTransport = s.transport && s.transport.length > 0
  const roundedTokens = s.total_tool_tokens ? Math.round(s.total_tool_tokens / 100) * 100 : null

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      <JsonLdScript data={[
        generateSoftwareApplicationJsonLd(s as Server),
        generateServerJsonLd(s as Server),
        generateBreadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: 'Servers', url: `${SITE_URL}/servers` },
          { name: s.name, url: `${SITE_URL}/s/${s.slug}` },
        ]),
        ...(faqs.length > 0 ? [generateFAQJsonLd(faqs)] : []),
      ]} />
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
        <Link href="/" className="hover:text-accent transition-colors">Home</Link>
        <span className="text-text-muted/50">/</span>
        <Link href="/servers" className="hover:text-accent transition-colors">Servers</Link>
        <span className="text-text-muted/50">/</span>
        <span className="text-text-primary font-medium truncate max-w-[300px]">{s.name}</span>
      </nav>
      {/* Archived banner */}
      {s.is_archived && (
        <div className="mb-6 p-4 rounded-md border border-red bg-red/5">
          <p className="text-sm text-red font-medium">
            This server has been archived and is no longer actively maintained.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <ServerIcon name={s.name} homepageUrl={s.homepage_url} authorGithub={s.author_github} size={40} />
          <h1 className="text-2xl font-semibold text-text-primary">{s.name}</h1>
          {s.author_type === 'official' && (
            <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">Official</span>
          )}
        </div>
        {s.tagline && <p className="text-text-muted mb-3">{stripHtml(s.tagline)}</p>}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <HealthBadge status={s.health_status as HealthStatus} />
          <HealthCheckBadge status={s.last_health_check_status} checkedAt={s.last_health_check_at} uptime={s.health_check_uptime || 0} />
          {s.publisher_verified && <VerifiedBadge type="publisher" />}
          {s.registry_verified && <VerifiedBadge type="registry" />}
          {s.verified && <VerifiedBadge type="mcppedia" />}
          {s.community_verified && <VerifiedBadge type="community" />}
        </div>
        <CategoryEditor slug={s.slug} initialCategories={s.categories} />
        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
          {s.github_stars > 0 && <span>&#9733; {formatNumber(s.github_stars)}</span>}
          {s.npm_weekly_downloads > 0 && <span>&#8595; {formatNumber(s.npm_weekly_downloads)}/wk</span>}
          {s.npm_package && (
            <a href={`https://www.npmjs.com/package/${s.npm_package}`} target="_blank" rel="noopener noreferrer" className="hover:text-text-primary">npm</a>
          )}
          {s.pip_package && (
            <a href={`https://pypi.org/project/${s.pip_package}`} target="_blank" rel="noopener noreferrer" className="hover:text-text-primary">PyPI</a>
          )}
          {s.github_url && (
            <a href={s.github_url} target="_blank" rel="noopener noreferrer" className="hover:text-text-primary">GitHub</a>
          )}
        </div>
      </div>

      {/* Mobile-only compact fact bar (replaces sidebar on small screens) */}
      <div className="lg:hidden flex flex-wrap items-center gap-2 mb-6 p-3 border border-border rounded-md bg-bg-secondary text-xs">
        {(s.score_total || 0) > 0 && <ScoreBadge score={s.score_total || 0} size="md" />}
        <span className={`px-2 py-0.5 rounded ${s.cve_count === 0 ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
          {s.cve_count === 0 ? 'No CVEs' : `${s.cve_count} CVEs`}
        </span>
        <span className={`px-2 py-0.5 rounded ${s.health_status === 'active' ? 'bg-green/10 text-green' : 'bg-bg-tertiary text-text-muted'}`}>
          {s.health_status}
        </span>
        {tools.length > 0 && <span className="px-2 py-0.5 rounded bg-accent/10 text-accent">{tools.length} tools</span>}
        {s.license && s.license !== 'NOASSERTION' && <span className="text-text-muted">{s.license}</span>}
      </div>

      {/* Two-column layout: content left, metadata sidebar right */}
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* 1. Quick Install — the thing people came for */}
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

          {/* Badge — help spread the word */}
          <section className="border border-accent/20 rounded-md p-4 bg-accent/5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">Are you the author?</p>
                <p className="text-xs text-text-muted">Add this badge to your README to show your security score and help users find safe servers.</p>
              </div>
            </div>
            <BadgeEmbed slug={s.slug} />
          </section>

          {/* Env Instructions */}
          {s.env_instructions && Object.keys(s.env_instructions).length > 0 && (
            <section id="api-keys" className="pt-8 border-t border-border">
              <EnvInstructions server={s} />
            </section>
          )}

          {/* 2. Should you use this server? */}
          <section id="about" className="pt-8 border-t border-border">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Should you use this server?</h2>
            <div className="space-y-4 text-sm">
              {(s.description || s.tagline) && (
                <p className="text-text-primary text-base">{stripHtml(s.description || s.tagline || '')}</p>
              )}
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className={`text-lg mt-0.5 ${scanFailed ? 'text-yellow' : openCVEs === 0 ? 'text-green' : 'text-red'}`}>{scanFailed ? '~' : openCVEs === 0 ? '\u2713' : '\u2717'}</span>
                  <div>
                    <p className="font-medium text-text-primary">Is it safe?</p>
                    <div className="text-text-muted space-y-1 mt-1">
                      <p>
                        {scanFailed
                          ? 'CVE scan unavailable \u2014 could not reach OSV.dev.'
                          : openCVEs === 0
                            ? <>{packageName ? `No known CVEs for ${packageName}.` : 'No package registry to scan.'}{fixedCVEs > 0 && ` ${fixedCVEs} previously resolved.`}</>
                            : <>{openCVEs} open CVE{openCVEs !== 1 ? 's' : ''}{fixedCVEs > 0 ? ` (${fixedCVEs} fixed)` : ''}.{' '}
                                {s.npm_package ? <a href={`https://osv.dev/list?ecosystem=npm&q=${encodeURIComponent(s.npm_package)}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">Verify on OSV.dev &rarr;</a> : s.pip_package ? <a href={`https://osv.dev/list?ecosystem=PyPI&q=${encodeURIComponent(s.pip_package)}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">Verify on OSV.dev &rarr;</a> : null}
                              </>
                        }
                      </p>
                      <p>{s.has_authentication ? 'Requires authentication to connect.' : 'No authentication \u2014 any process on your machine can connect.'}</p>
                      <p>
                        {s.license && s.license !== 'NOASSERTION'
                          ? <>{s.license}.{s.github_url && <>{' '}<a href={`${s.github_url}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">View license &rarr;</a></>}</>
                          : 'License not specified.'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                  <span className={`text-lg mt-0.5 ${(daysSinceCommit !== null && daysSinceCommit < 90) ? 'text-green' : 'text-yellow'}`}>{(daysSinceCommit !== null && daysSinceCommit < 90) ? '\u2713' : '~'}</span>
                  <div>
                    <p className="font-medium text-text-primary">Is it maintained?</p>
                    <p className="text-text-muted">
                      {daysSinceCommit !== null ? `Last commit ${daysSinceCommit} days ago. ` : 'Commit history unknown. '}
                      {s.github_stars > 0 ? `${s.github_stars.toLocaleString()} stars. ` : ''}
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
                          : ' Compatibility not confirmed.'}
                    </p>
                  </div>
                </div>
                {(tools.length > 0 || roundedTokens) && (
                  <div className="flex items-start gap-3 p-3 rounded-md border border-border">
                    <span className={`text-lg mt-0.5 ${s.token_efficiency_grade === 'A' || s.token_efficiency_grade === 'B' ? 'text-green' : s.token_efficiency_grade === 'C' ? 'text-yellow' : 'text-text-muted'}`}>{s.token_efficiency_grade && s.token_efficiency_grade !== 'unknown' ? s.token_efficiency_grade : '?'}</span>
                    <div>
                      <p className="font-medium text-text-primary">Context cost</p>
                      <p className="text-text-muted">
                        {tools.length} tool{tools.length !== 1 ? 's' : ''}.
                        {roundedTokens ? ` ~${roundedTokens.toLocaleString()} tokens (${((s.total_tool_tokens / 200000) * 100).toFixed(1)}% of 200K).` : ''}
                        {tools.length > 20 ? ' Consider loading selectively.' : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <CommunityVerify serverId={s.id} initialCount={s.community_verification_count || 0} />
            </div>
          </section>

          {/* README */}
          <ServerReadme githubUrl={s.github_url} />

          {/* Test it */}
          <section id="test" className="pt-8 border-t border-border">
            <ServerTester server={s} />
          </section>

          {/* Tools */}
          {tools.length > 0 && (
            <section id="tools" className="pt-8 border-t border-border">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Tools ({tools.length})</h2>
              <ToolsList tools={tools} />
            </section>
          )}

          {/* Resources */}
          {resources.length > 0 && (
            <section id="resources" className="pt-8 border-t border-border">
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
            <section id="prompts" className="pt-8 border-t border-border">
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
            <section id="api-info" className="pt-8 border-t border-border">
              <h2 className="text-lg font-semibold text-text-primary mb-4">API Info</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex gap-4"><dt className="text-text-muted w-28 shrink-0">API</dt><dd className="text-text-primary">{s.api_name}</dd></div>
                {s.api_pricing && s.api_pricing !== 'unknown' && <div className="flex gap-4"><dt className="text-text-muted w-28 shrink-0">Pricing</dt><dd className="text-text-primary capitalize">{s.api_pricing}</dd></div>}
                {s.api_rate_limits && <div className="flex gap-4"><dt className="text-text-muted w-28 shrink-0">Rate limits</dt><dd className="text-text-primary">{s.api_rate_limits}</dd></div>}
                <div className="flex gap-4"><dt className="text-text-muted w-28 shrink-0">Auth required</dt><dd className="text-text-primary">{s.requires_api_key ? 'Yes' : 'No'}</dd></div>
              </dl>
            </section>
          )}

          {/* Version History */}
          {changelogs && changelogs.length > 0 && (
            <section id="versions" className="pt-8 border-t border-border">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Version History</h2>
              <div className="space-y-3">
                {(changelogs as Changelog[]).map(cl => (
                  <div key={cl.id} className="flex items-start gap-3 text-sm">
                    <span className="font-mono text-text-primary shrink-0">{cl.version || 'unknown'}</span>
                    <span className="text-text-muted">({new Date(cl.detected_at).toLocaleDateString()})</span>
                    {cl.changes_summary && <span className="text-text-muted">&mdash; {cl.changes_summary}</span>}
                    {cl.github_release_url && <a href={cl.github_release_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover shrink-0">Release</a>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Help improve — shown when page is thin */}
          {!s.description && (
            <section className="border border-accent/20 rounded-md p-5 bg-accent/5">
              <h3 className="font-semibold text-text-primary mb-1">Help improve this page</h3>
              <p className="text-sm text-text-muted mb-3">
                This server is missing a description.{tools.length === 0 ? ' Tools and install config are also missing.' : ''} If you&apos;ve used it, help the community.
              </p>
              <Link href={`/s/${slug}/edit`} className="inline-block px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors">
                Add information
              </Link>
            </section>
          )}
        </div>

        {/* Metadata sidebar — hidden on mobile */}
        <ServerSidebar server={s} />
      </div>

      {/* Full-width sections below the 2-column area */}
      <div className="mt-10 space-y-10">
        {/* Score Breakdown */}
        <section id="details" className="pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Score Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ScoreCard server={s} advisories={(advisories as SecurityAdvisory[]) || []} />
            <SecurityCard server={s} advisories={(advisories as SecurityAdvisory[]) || []} />
          </div>
        </section>

        {/* Reviews */}
        <section id="reviews" className="pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Reviews
            {s.review_count > 0 && <span className="text-sm font-normal text-text-muted ml-2">({s.review_count})</span>}
          </h2>
          <ReviewSection serverId={s.id} />
        </section>

        {/* FAQ */}
        {faqs.length > 0 && (
          <ServerFAQ faqs={faqs} />
        )}

        {/* Similar Servers */}
        {similarServers && similarServers.length > 0 && (
          <section className="pt-8 border-t border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Similar servers</h2>
              <Link href={`/servers?category=${(s.categories || [])[0] || ''}`} className="text-sm text-accent hover:text-accent-hover">
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(similarServers as Server[]).map(server => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          </section>
        )}

        {/* Newsletter */}
        <section className="pt-8 border-t border-border">
          <NewsletterSignup
            context={`Get CVE alerts and security updates for ${s.name} and similar servers.`}
          />
        </section>

        {/* Discussion */}
        <section id="discussion" className="pt-8 border-t border-border">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Discussion</h2>
          <DiscussionSection serverId={s.id} />
        </section>
      </div>
    </div>
  )
}
