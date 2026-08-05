import Link from 'next/link'
import { CATEGORIES, CATEGORY_LABELS, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateBreadcrumbJsonLd, generateItemListJsonLd } from '@/lib/seo'
import { getCatalogCounts, formatApproxTotal } from '@/lib/live-counts'
import HubIntro from '@/components/HubIntro'
import type { Category } from '@/lib/constants'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: 'Best MCP Servers by Category — MCPpedia' },
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

export const revalidate = 86400 // 1d — the intro quotes a live catalog count

export default async function BestPage() {
  const { totalServers } = await getCatalogCounts()
  const catalogSize = formatApproxTotal(totalServers)

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <JsonLdScript data={[
        generateBreadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: 'Best MCP Servers', url: `${SITE_URL}/best` },
        ]),
        // The 22 category hubs as a machine-readable list, so this page is a
        // navigable index to a crawler and not just a grid of cards.
        generateItemListJsonLd(CATEGORIES.map(cat => ({
          name: `Best ${CATEGORY_LABELS[cat as Category]} MCP Servers`,
          url: `${SITE_URL}/best/${cat}`,
        }))),
      ]} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Best MCP Servers by Category</h1>
        <p className="text-text-muted max-w-2xl">
          Every ranking is powered by MCPpedia&apos;s security score — combining daily CVE scanning, maintenance status, documentation quality, and token efficiency.
        </p>
      </div>

      <HubIntro
        updatedAt={new Date()}
        paragraphs={[
          `MCPpedia tracks ${catalogSize} MCP servers across ${CATEGORIES.length} categories, and ranks the ` +
            `top ten in each. The ranking is not a popularity count: GitHub stars measure how many people ` +
            `bookmarked a repository, not whether its tool definitions are safe to hand an agent.`,
          `Each server is scored 0-100 on five weighted inputs — security (CVE scanning, tool-poisoning ` +
            `detection, and whether the server authenticates at all), maintenance (commit recency, release ` +
            `cadence, download trend), documentation, client compatibility, and token efficiency, which is ` +
            `how much of your context window the tool definitions consume before you have asked anything. ` +
            `Scores are recomputed daily and every input is shown on the server's own page, so you can ` +
            `disagree with the weighting and still use the evidence.`,
          `Pick a category below for its ranked top ten, or browse the full catalog if you already know ` +
            `what you are looking for.`,
        ]}
        siblingsLabel="Or start from a use case"
        siblings={[
          { label: 'Developers', href: '/best-for/developers' },
          { label: 'Data engineering', href: '/best-for/data-engineering' },
          { label: 'AI agents', href: '/best-for/ai-agents' },
          { label: 'Cloud infrastructure', href: '/best-for/cloud-infrastructure' },
          { label: 'Security', href: '/best-for/security' },
        ]}
      />

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
            Search all {catalogSize} MCP servers &rarr;
          </Link>
        </p>
      </div>
    </div>
  )
}
