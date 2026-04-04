import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServerCard from '@/components/ServerCard'
import Link from 'next/link'
import type { Server } from '@/lib/types'
import { SITE_URL, PUBLIC_SERVER_FIELDS } from '@/lib/constants'
import type { Metadata } from 'next'

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

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
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
