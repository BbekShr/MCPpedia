import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateBreadcrumbJsonLd } from '@/lib/seo'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Best MCP Servers by Category — MCPpedia',
  description: 'Find the best MCP servers for every use case — each ranked by MCPpedia\'s security score, maintenance, and efficiency. Backed by daily CVE scanning.',
  openGraph: {
    title: 'Best MCP Servers by Category — MCPpedia',
    description: 'Security-scored MCP server rankings across 23 categories.',
    url: `${SITE_URL}/best`,
  },
  alternates: { canonical: `${SITE_URL}/best` },
}

const CATEGORY_ICONS: Partial<Record<Category, string>> = {
  'developer-tools': '⚙',
  'data': '🗄',
  'ai-ml': '🤖',
  'productivity': '✅',
  'cloud': '☁',
  'security': '🔒',
  'devops': '🚀',
  'communication': '💬',
  'analytics': '📊',
  'search': '🔍',
  'browser': '🌐',
  'writing': '✍',
  'finance': '💰',
  'maps': '🗺',
  'design': '🎨',
  'ecommerce': '🛒',
  'health': '🏥',
  'education': '📚',
  'marketing': '📣',
  'entertainment': '🎬',
  'legal': '⚖',
  'other': '📦',
}

export default function BestPage() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <JsonLdScript data={generateBreadcrumbJsonLd([
        { name: 'Home', url: SITE_URL },
        { name: 'Best MCP Servers', url: `${SITE_URL}/best` },
      ])} />

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Best MCP Servers by Category</h1>
        <p className="text-text-muted max-w-2xl">
          Every ranking is powered by MCPpedia&apos;s security score — combining daily CVE scanning, maintenance status, documentation quality, and token efficiency.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {CATEGORIES.map(cat => (
          <Link
            key={cat}
            href={`/best/${cat}`}
            className="group border border-border rounded-lg p-4 hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px] transition-all bg-bg hover:bg-bg-secondary"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xl" aria-hidden="true">{CATEGORY_ICONS[cat] || '📦'}</span>
              <span className="font-medium text-sm text-text-primary group-hover:text-accent transition-colors">
                Best {CATEGORY_LABELS[cat as Category]} Servers
              </span>
            </div>
            <p className="text-xs text-text-muted pl-9">
              Top 10 ranked by MCPpedia score &rarr;
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <p className="text-sm text-text-muted">
          Looking for a specific use case?{' '}
          <Link href="/servers" className="text-accent hover:text-accent-hover">
            Search all {/* dynamic */}MCP servers &rarr;
          </Link>
        </p>
      </div>
    </div>
  )
}
