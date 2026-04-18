import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUBLIC_SERVER_FIELDS, PUBLIC_CARD_FIELDS } from '@/lib/constants'
import DiscussionSection from '@/components/DiscussionSection'
import NewsletterSignup from '@/components/NewsletterSignup'
import BadgeEmbed from '@/components/BadgeEmbed'
import ServerFAQ, { buildServerFAQs } from '@/components/ServerFAQ'
import ReviewSection from '@/components/ReviewSection'
import ServerTester from '@/components/ServerTester'
import EnvInstructions from '@/components/EnvInstructions'
import CommunityVerify from '@/components/CommunityVerify'
import CategoryEditor from '@/components/CategoryEditor'
import ServerSidebar from '@/components/ServerSidebar'
import ServerReadme from '@/components/ServerReadme'
import Hero from '@/components/server/Hero'
import SubNav from '@/components/server/SubNav'
import InstallMatrix from '@/components/server/InstallMatrix'
import ScorePanel from '@/components/server/ScorePanel'
import SecurityPanel from '@/components/server/SecurityPanel'
import ToolInspector from '@/components/server/ToolInspector'
import VersionList from '@/components/server/VersionList'
import SimilarGrid from '@/components/server/SimilarGrid'
import { SectionHeader } from '@/components/server/helpers'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import {
  JsonLdScript,
  generateServerJsonLd,
  generateBreadcrumbJsonLd,
  generateFAQJsonLd,
} from '@/lib/seo'
import type { Server, Changelog, SecurityAdvisory } from '@/lib/types'
import type { Metadata } from 'next'

export const revalidate = 86400

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = createPublicClient()
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
    const supabase = createAdminClient('static-params')
    const { data } = await supabase
      .from('servers')
      .select('slug')
      .order('github_stars', { ascending: false })
      .limit(1000)

    return (data || []).map(s => ({ slug: s.slug }))
  } catch {
    return []
  }
}

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()

  const { data: server } = await supabase
    .from('servers')
    .select(PUBLIC_SERVER_FIELDS)
    .eq('slug', slug)
    .single()

  if (!server) notFound()

  const s = server as Server

  const [{ data: changelogs }, { data: advisoriesData }, { data: similarServers }] = await Promise.all([
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
      .select(PUBLIC_CARD_FIELDS)
      .overlaps('categories', s.categories || [])
      .neq('slug', slug)
      .eq('is_archived', false)
      .gt('score_total', 0)
      .order('score_total', { ascending: false })
      .limit(4),
  ])

  const advisories = (advisoriesData as SecurityAdvisory[] | null) ?? []
  const tools = s.tools || []
  const resources = s.resources || []
  const prompts = s.prompts || []
  const faqs = buildServerFAQs(s)
  const description = s.description || s.tagline ? stripHtml(s.description || s.tagline || '') : null
  const hasEnvInstructions = s.env_instructions && Object.keys(s.env_instructions).length > 0
  const hasChangelog = !!(changelogs && changelogs.length > 0)
  const hasSimilar = !!(similarServers && similarServers.length > 0)

  const navItems = [
    { id: 'install', label: 'Install' },
    { id: 'about', label: 'About' },
    { id: 'score', label: 'Score' },
    { id: 'security', label: 'Security' },
    ...(tools.length ? [{ id: 'tools', label: 'Tools' }] : []),
    ...(hasChangelog ? [{ id: 'versions', label: 'Versions' }] : []),
    { id: 'reviews', label: 'Reviews' },
    ...(hasSimilar ? [{ id: 'similar', label: 'Similar' }] : []),
    { id: 'discussion', label: 'Discussion' },
  ]

  return (
    <div className="min-h-screen">
      <JsonLdScript
        data={[
          generateServerJsonLd(s),
          generateBreadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'Servers', url: `${SITE_URL}/servers` },
            { name: s.name, url: `${SITE_URL}/s/${s.slug}` },
          ]),
          ...(faqs.length > 0 ? [generateFAQJsonLd(faqs)] : []),
        ]}
      />

      <Hero server={s} advisories={advisories} />
      <SubNav items={navItems} />

      <main className="max-w-[1200px] mx-auto px-4 md:px-6 pt-6 pb-20">
        {s.is_archived && (
          <div className="mb-6 p-4 rounded-md border border-red bg-red/5">
            <p className="text-sm text-red font-medium">
              This server has been archived and is no longer actively maintained.
            </p>
          </div>
        )}

        <CategoryEditor slug={s.slug} initialCategories={s.categories} />

        <div className="flex gap-8 mt-4">
          <div className="flex-1 min-w-0 flex flex-col gap-10">
            {/* Install */}
            <section id="install" className="scroll-mt-[70px]">
              <SectionHeader
                eyebrow="Step 1"
                title="Install in your client"
                desc="Config is the same across clients — only the file and path differ."
              />
              <InstallMatrix server={s} />

              {/* Badge embed — keep prominent for authors */}
              <section className="border border-accent/20 rounded-md p-4 bg-accent/5 mt-6">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Are you the author?</p>
                    <p className="text-xs text-text-muted">
                      Add this badge to your README to show your security score and help users find safe servers.
                    </p>
                  </div>
                </div>
                <BadgeEmbed slug={s.slug} />
              </section>

              {hasEnvInstructions && (
                <section id="api-keys" className="mt-6">
                  <EnvInstructions server={s} />
                </section>
              )}
            </section>

            {/* About */}
            <section id="about" className="scroll-mt-[70px]">
              <SectionHeader eyebrow="Read me" title={`What ${s.name} does`} />
              {description ? (
                <p className="m-0 text-[15px] text-text-primary leading-[1.65] max-w-[760px]">{description}</p>
              ) : (
                <div
                  className="p-4 rounded-md text-[13.5px] text-text-muted"
                  style={{
                    border: '1px dashed var(--border)',
                    background: 'color-mix(in srgb, var(--yellow) 6%, transparent)',
                  }}
                >
                  <p className="m-0 text-text-primary font-medium">No description provided.</p>
                  <p className="mt-1 mb-2">
                    This server is thin — proceed with caution.{' '}
                    <Link href={`/s/${s.slug}/edit`} className="text-accent">
                      Help improve this page →
                    </Link>
                  </p>
                </div>
              )}

              {/* Test it */}
              <div id="test" className="mt-6">
                <ServerTester server={s} />
              </div>

              {/* README — streamed so the rest of the page doesn't block on GitHub */}
              <Suspense
                fallback={<div className="mt-6 text-sm text-text-muted">Loading README…</div>}
              >
                <ServerReadme githubUrl={s.github_url} />
              </Suspense>

              <div className="mt-4">
                <CommunityVerify serverId={s.id} initialCount={s.community_verification_count || 0} />
              </div>
            </section>

            {/* Score + Security */}
            <section id="score" className="scroll-mt-[70px]">
              <SectionHeader
                eyebrow="Scored, not listed"
                title="Why this score"
                desc="Five weighted categories — click any category to see the underlying evidence."
              />
              <div className="flex flex-col gap-4">
                <ScorePanel server={s} />
                <div id="security" className="scroll-mt-[70px]">
                  <SecurityPanel server={s} advisories={advisories} />
                </div>
              </div>
            </section>

            {/* Tools */}
            {tools.length > 0 && (
              <section id="tools" className="scroll-mt-[70px]">
                <SectionHeader
                  eyebrow="Inventory"
                  title={`Tools (${tools.length})`}
                  desc="Click any tool to inspect its schema."
                />
                <ToolInspector tools={tools} totalTokens={s.total_tool_tokens} />
              </section>
            )}

            {/* Resources */}
            {resources.length > 0 && (
              <section id="resources">
                <SectionHeader eyebrow="Inventory" title={`Resources (${resources.length})`} />
                <div className="flex flex-col gap-2">
                  {resources.map(r => (
                    <div key={r.name} className="border border-border rounded-md p-3">
                      <code className="text-sm font-mono font-medium text-text-primary">{r.name}</code>
                      {r.description && (
                        <p className="text-sm text-text-muted mt-0.5">{r.description}</p>
                      )}
                      {r.uri_template && (
                        <p className="text-xs text-text-muted mt-1 font-mono">{r.uri_template}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Prompts */}
            {prompts.length > 0 && (
              <section id="prompts">
                <SectionHeader eyebrow="Inventory" title={`Prompts (${prompts.length})`} />
                <div className="flex flex-col gap-2">
                  {prompts.map(p => (
                    <div key={p.name} className="border border-border rounded-md p-3">
                      <code className="text-sm font-mono font-medium text-text-primary">{p.name}</code>
                      {p.description && (
                        <p className="text-sm text-text-muted mt-0.5">{p.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* API Info */}
            {s.api_name && (
              <section id="api-info">
                <SectionHeader eyebrow="API" title="API information" />
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

            {/* Versions */}
            {hasChangelog && (
              <section id="versions" className="scroll-mt-[70px]">
                <SectionHeader eyebrow="Changelog" title="Version history" />
                <VersionList changelogs={changelogs as Changelog[]} />
              </section>
            )}

            {/* Help improve */}
            {!s.description && (
              <section className="border border-accent/20 rounded-md p-5 bg-accent/5">
                <h3 className="font-semibold text-text-primary mb-1">Help improve this page</h3>
                <p className="text-sm text-text-muted mb-3">
                  This server is missing a description.
                  {tools.length === 0 ? ' Tools and install config are also missing.' : ''} If
                  you&apos;ve used it, help the community.
                </p>
                <Link
                  href={`/s/${s.slug}/edit`}
                  className="inline-block px-4 py-2 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors"
                >
                  Add information
                </Link>
              </section>
            )}
          </div>

          <ServerSidebar server={s} />
        </div>

        {/* Full-width sections below the 2-column area */}
        <div className="mt-10 flex flex-col gap-10">
          <section id="reviews" className="scroll-mt-[70px]">
            <SectionHeader
              eyebrow="Community"
              title="Reviews"
              desc={s.review_count > 0 ? `${s.review_count} review${s.review_count !== 1 ? 's' : ''}` : 'Be the first to review'}
            />
            <ReviewSection serverId={s.id} />
          </section>

          {faqs.length > 0 && <ServerFAQ faqs={faqs} />}

          {hasSimilar && (
            <section id="similar" className="scroll-mt-[70px]">
              <SectionHeader
                eyebrow="Related"
                title="Similar servers"
                desc={`Others in ${(s.categories || []).join(' / ') || 'this space'}`}
                right={
                  <Link
                    href={`/servers?category=${encodeURIComponent((s.categories || [])[0] || '')}`}
                    className="text-sm text-accent hover:text-accent-hover"
                  >
                    View all →
                  </Link>
                }
              />
              <SimilarGrid servers={similarServers as Server[]} />
            </section>
          )}

          <section>
            <NewsletterSignup
              context={`Get CVE alerts and security updates for ${s.name} and similar servers.`}
            />
          </section>

          <section id="discussion" className="scroll-mt-[70px]">
            <SectionHeader eyebrow="Community" title="Discussion" />
            <DiscussionSection serverId={s.id} />
          </section>
        </div>
      </main>
    </div>
  )
}
