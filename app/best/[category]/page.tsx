import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import { CATEGORIES, CATEGORY_LABELS, SITE_URL, PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import { JsonLdScript, generateItemListJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'

export const revalidate = 60

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  'productivity': 'MCP servers for Slack, email, calendar, task management, and workflow automation — scored on security and reliability.',
  'developer-tools': 'MCP servers for GitHub, databases, filesystems, code review, and developer tooling — each scored on security and maintenance.',
  'data': 'MCP servers for SQL databases, data pipelines, ETL, and data lake access — scored on security and maintenance.',
  'finance': 'MCP servers for financial data, accounting, payment APIs, and market data feeds — verified and security-scored.',
  'ai-ml': 'MCP servers for AI memory, vector search, model APIs, and LLM tooling — scored on security and token efficiency.',
  'communication': 'MCP servers for Slack, email, Discord, SMS, and team communication tools.',
  'cloud': 'MCP servers for AWS, GCP, Azure, and cloud resource management — scored on security and maintenance.',
  'security': 'MCP servers for vulnerability scanning, secrets management, compliance, and security tooling.',
  'analytics': 'MCP servers for analytics platforms, metrics APIs, BI tools, and data visualization.',
  'design': 'MCP servers for Figma, design systems, image generation, and creative tooling.',
  'devops': 'MCP servers for Docker, Kubernetes, CI/CD, monitoring, and infrastructure management.',
  'education': 'MCP servers for learning platforms, documentation search, and educational content APIs.',
  'entertainment': 'MCP servers for media APIs, gaming, streaming services, and entertainment platforms.',
  'health': 'MCP servers for health data APIs, medical records, and wellness tooling.',
  'marketing': 'MCP servers for CRM, advertising APIs, email marketing, and analytics platforms.',
  'search': 'MCP servers for web search, knowledge bases, document retrieval, and semantic search.',
  'writing': 'MCP servers for document editors, note-taking apps, writing assistants, and content management.',
  'maps': 'MCP servers for geolocation, mapping APIs, routing, and geographic data.',
  'ecommerce': 'MCP servers for online stores, payment processing, inventory management, and e-commerce APIs.',
  'legal': 'MCP servers for legal document analysis, contract management, and compliance tooling.',
  'browser': 'MCP servers for web browser automation, scraping, and web interaction.',
  'other': 'MCP servers that span multiple categories or serve specialized use cases — all security-scored.',
}

export async function generateStaticParams() {
  return CATEGORIES.map(category => ({ category }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  if (!CATEGORIES.includes(category as Category)) return { title: 'Not Found' }

  const label = CATEGORY_LABELS[category as Category]
  const description = CATEGORY_DESCRIPTIONS[category as Category]

  return {
    title: `Best ${label} MCP Servers — MCPpedia`,
    description,
    openGraph: {
      title: `Best ${label} MCP Servers`,
      description,
      type: 'website',
      url: `${SITE_URL}/best/${category}`,
    },
    alternates: { canonical: `${SITE_URL}/best/${category}` },
  }
}

export default async function BestCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  if (!CATEGORIES.includes(category as Category)) notFound()

  const label = CATEGORY_LABELS[category as Category]
  const description = CATEGORY_DESCRIPTIONS[category as Category]

  const supabase = await createClient()

  const { data: servers } = await supabase
    .from('servers')
    .select(PUBLIC_SERVER_FIELDS)
    .contains('categories', [category])
    .eq('is_archived', false)
    .gt('score_total', 0)
    .order('score_total', { ascending: false })
    .limit(10)

  const itemListJsonLd = servers && servers.length > 0
    ? generateItemListJsonLd(
        (servers as Server[]).map(s => ({
          name: `${s.name} MCP Server`,
          url: `${SITE_URL}/s/${s.slug}`,
          description: s.tagline || undefined,
        }))
      )
    : null

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      {itemListJsonLd && <JsonLdScript data={itemListJsonLd} />}
      <JsonLdScript data={generateBreadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Best MCP Servers', url: `${SITE_URL}/best` },
        { name: `Best ${label} MCP Servers`, url: `${SITE_URL}/best/${category}` },
      ])} />

      {/* Header */}
      <div className="mb-8">
        <div className="text-xs text-text-muted mb-2">
          <Link href="/best" className="hover:text-text-primary">Best MCP Servers</Link>
          <span className="mx-1">/</span>
          <span>{label}</span>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Best {label} MCP Servers</h1>
        <p className="text-text-muted max-w-2xl">{description}</p>
      </div>

      {/* Ranked list */}
      <div className="space-y-4">
        {(servers as Server[] || []).map((server, i) => (
          <div key={server.id} className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-bold text-text-muted shrink-0 mt-2">
              {i + 1}
            </div>
            <div className="flex-1">
              <ServerCard server={server} />
            </div>
            <div className="hidden md:flex flex-col items-center shrink-0 w-16 mt-2">
              <span className="text-2xl font-bold text-text-primary">{server.score_total}</span>
              <span className="text-xs text-text-muted">score</span>
            </div>
          </div>
        ))}
      </div>

      {(!servers || servers.length === 0) && (
        <div className="text-center py-12">
          <p className="text-text-muted mb-3">No scored servers in this category yet.</p>
          <Link href={`/servers?category=${category}`} className="text-sm text-accent hover:text-accent-hover">
            Browse all {label} servers &rarr;
          </Link>
        </div>
      )}

      {servers && servers.length > 0 && (
        <div className="mt-6">
          <Link
            href={`/servers?category=${category}&sort=score`}
            className="text-sm text-accent hover:text-accent-hover"
          >
            See all {label} servers &rarr;
          </Link>
        </div>
      )}

      {/* Other categories */}
      <div className="mt-12 border-t border-border pt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Explore other categories</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES
            .filter(c => c !== category)
            .slice(0, 12)
            .map(c => (
              <Link
                key={c}
                href={`/best/${c}`}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                {CATEGORY_LABELS[c as Category]}
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}
