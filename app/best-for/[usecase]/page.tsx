import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import { SITE_URL, PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import { JsonLdScript, generateItemListJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'

export const revalidate = 60

const USE_CASES: Record<string, {
  title: string
  description: string
  categories: string[]
  keywords: string[]
}> = {
  'developers': {
    title: 'Best MCP Servers for Developers',
    description: 'Code management, GitHub, databases, file systems, and dev tooling — the essential MCP servers for software development.',
    categories: ['developer-tools'],
    keywords: ['github', 'postgres', 'filesystem', 'git', 'code'],
  },
  'data-engineering': {
    title: 'Best MCP Servers for Data Engineering',
    description: 'Database access, data pipelines, analytics, and ETL — MCP servers for working with data at scale.',
    categories: ['data', 'analytics'],
    keywords: ['postgres', 'sql', 'database', 'analytics', 'data'],
  },
  'productivity': {
    title: 'Best MCP Servers for Productivity',
    description: 'Slack, email, calendar, project management — MCP servers that supercharge your daily workflow.',
    categories: ['productivity', 'communication'],
    keywords: ['slack', 'email', 'calendar', 'notion', 'todo'],
  },
  'ai-agents': {
    title: 'Best MCP Servers for AI Agents',
    description: 'Memory, reasoning, web browsing, and tool orchestration — MCP servers for building autonomous AI agents.',
    categories: ['ai-ml'],
    keywords: ['memory', 'thinking', 'browse', 'search', 'agent'],
  },
  'cloud-infrastructure': {
    title: 'Best MCP Servers for Cloud Infrastructure',
    description: 'AWS, GCP, Azure, Docker, Kubernetes — MCP servers for managing cloud resources from your AI assistant.',
    categories: ['cloud', 'devops'],
    keywords: ['aws', 'cloud', 'docker', 'kubernetes', 'deploy'],
  },
  'security': {
    title: 'Best MCP Servers for Security',
    description: 'Vulnerability scanning, secrets management, and compliance — MCP servers for security teams.',
    categories: ['security'],
    keywords: ['security', 'scan', 'vulnerability', 'secrets', 'compliance'],
  },
  'web-scraping': {
    title: 'Best MCP Servers for Web Scraping & Crawling',
    description: 'Web crawling, data extraction, and browser automation — MCP servers for gathering and processing web data.',
    categories: ['developer-tools'],
    keywords: ['scrape', 'crawl', 'extract', 'selenium', 'browser', 'automation'],
  },
  'file-management': {
    title: 'Best MCP Servers for File & Document Management',
    description: 'File systems, cloud storage, and document processing — MCP servers for managing files and data.',
    categories: ['developer-tools'],
    keywords: ['filesystem', 'storage', 'documents', 's3', 'files', 'pdf'],
  },
  'monitoring': {
    title: 'Best MCP Servers for Monitoring & Observability',
    description: 'Logging, alerting, metrics, and APM — MCP servers for observing and monitoring systems.',
    categories: ['devops'],
    keywords: ['logging', 'metrics', 'monitoring', 'alerts', 'observability', 'apm'],
  },
  'communication': {
    title: 'Best MCP Servers for Communication & Messaging',
    description: 'Email, chat platforms, and notifications — MCP servers for team communication and messaging.',
    categories: ['communication'],
    keywords: ['email', 'slack', 'chat', 'messaging', 'notifications', 'sms'],
  },
  'databases': {
    title: 'Best MCP Servers for Databases & Storage',
    description: 'SQL, NoSQL, vector databases, and caching — MCP servers for data storage and retrieval.',
    categories: ['data'],
    keywords: ['database', 'sql', 'nosql', 'vector', 'mongodb', 'redis', 'postgres'],
  },
  'design-tools': {
    title: 'Best MCP Servers for Design & Creative Tools',
    description: 'Image generation, design systems, and media processing — MCP servers for creative workflows.',
    categories: ['ai-ml'],
    keywords: ['design', 'image', 'creative', 'generation', 'media', 'graphics'],
  },
}

export async function generateStaticParams() {
  return Object.keys(USE_CASES).map(usecase => ({ usecase }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ usecase: string }>
}): Promise<Metadata> {
  const { usecase } = await params
  const uc = USE_CASES[usecase]
  if (!uc) return { title: 'Not Found' }
  return {
    title: `${uc.title} — MCPpedia`,
    description: uc.description,
    openGraph: {
      title: uc.title,
      description: uc.description,
      type: 'website',
      url: `${SITE_URL}/best-for/${usecase}`,
    },
    alternates: {
      canonical: `${SITE_URL}/best-for/${usecase}`,
    },
  }
}

export default async function BestForPage({
  params,
}: {
  params: Promise<{ usecase: string }>
}) {
  const { usecase } = await params
  const uc = USE_CASES[usecase]
  if (!uc) notFound()

  const supabase = await createClient()

  // Fetch servers matching categories, sorted by MCPpedia score
  const { data: servers } = await supabase
    .from('servers')
    .select(PUBLIC_SERVER_FIELDS)
    .overlaps('categories', uc.categories)
    .order('score_total', { ascending: false })
    .limit(20)

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
        { name: 'Best MCP Servers', url: `${SITE_URL}/best-for` },
        { name: uc.title, url: `${SITE_URL}/best-for/${usecase}` },
      ])} />
      <h1 className="text-2xl font-semibold text-text-primary mb-2">{uc.title}</h1>
      <p className="text-text-muted mb-8">{uc.description}</p>

      {/* Ranked list */}
      <div className="space-y-4">
        {(servers as Server[] || []).map((server, i) => (
          <div key={server.id} className="flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-bold text-text-muted shrink-0">
              {i + 1}
            </div>
            <div className="flex-1">
              <ServerCard server={server} />
            </div>
            <div className="hidden md:flex flex-col items-center shrink-0 w-16">
              <span className="text-2xl font-bold text-text-primary">{server.score_total}</span>
              <span className="text-xs text-text-muted">score</span>
            </div>
          </div>
        ))}
      </div>

      {(!servers || servers.length === 0) && (
        <p className="text-text-muted">No servers found for this use case yet.</p>
      )}

      {/* Other use cases */}
      <div className="mt-12 border-t border-border pt-8">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Other use cases</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(USE_CASES)
            .filter(([key]) => key !== usecase)
            .map(([key, val]) => (
              <Link
                key={key}
                href={`/best-for/${key}`}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                {val.title.replace('Best MCP Servers for ', '')}
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}
