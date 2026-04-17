import Link from 'next/link'
import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import { SITE_URL } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Compare MCP Servers — Side-by-Side Comparisons',
  description: 'Compare MCP servers side-by-side. See scores, security, tools, downloads, and compatibility for the top MCP servers.',
  alternates: {
    canonical: `${SITE_URL}/compare`,
  },
}

interface ComparisonPair {
  slugA: string
  slugB: string
  nameA: string
  nameB: string
  category?: string
}

function loadPairs(): ComparisonPair[] {
  try {
    const filePath = path.join(process.cwd(), 'data', 'comparison-pairs.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return data.pairs || []
  } catch {
    return []
  }
}

export default function CompareIndexPage() {
  const pairs = loadPairs()

  // Group by category
  const byCategory = new Map<string, ComparisonPair[]>()
  const uncategorized: ComparisonPair[] = []

  for (const pair of pairs) {
    if (pair.category) {
      const existing = byCategory.get(pair.category) || []
      existing.push(pair)
      byCategory.set(pair.category, existing)
    } else {
      uncategorized.push(pair)
    }
  }

  const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">Compare MCP Servers</h1>
      <p className="text-text-muted mb-8">
        Side-by-side comparisons of the top MCP servers. Compare scores, security, tools, and more.
      </p>

      {/* Custom comparison */}
      <div className="mb-8 p-4 bg-bg-secondary border border-border rounded-lg">
        <p className="text-sm text-text-muted">
          Compare any two servers by visiting:{' '}
          <code className="bg-code-bg px-1 rounded text-xs">mcppedia.org/compare/server-a-vs-server-b</code>
        </p>
      </div>

      {pairs.length === 0 ? (
        <p className="text-text-muted text-center py-12">
          Comparison pairs are being generated. Check back soon.
        </p>
      ) : (
        <>
          {/* Category sections */}
          {sortedCategories.map(([category, catPairs]) => (
            <section key={category} className="mb-8">
              <h2 className="text-lg font-semibold text-text-primary mb-3 capitalize">
                {category.replace(/-/g, ' ')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {catPairs.slice(0, 12).map(pair => (
                  <Link
                    key={`${pair.slugA}-vs-${pair.slugB}`}
                    href={`/compare/${pair.slugA}-vs-${pair.slugB}`}
                    className="block p-3 border border-border rounded-md hover:border-accent transition-colors text-sm"
                  >
                    <span className="text-text-primary font-medium">{pair.nameA}</span>
                    <span className="text-text-muted mx-1.5">vs</span>
                    <span className="text-text-primary font-medium">{pair.nameB}</span>
                  </Link>
                ))}
              </div>
              {catPairs.length > 12 && (
                <p className="text-xs text-text-muted mt-2">
                  + {catPairs.length - 12} more comparisons in this category
                </p>
              )}
            </section>
          ))}

          {/* Cross-category */}
          {uncategorized.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-text-primary mb-3">Cross-Category</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {uncategorized.slice(0, 18).map(pair => (
                  <Link
                    key={`${pair.slugA}-vs-${pair.slugB}`}
                    href={`/compare/${pair.slugA}-vs-${pair.slugB}`}
                    className="block p-3 border border-border rounded-md hover:border-accent transition-colors text-sm"
                  >
                    <span className="text-text-primary font-medium">{pair.nameA}</span>
                    <span className="text-text-muted mx-1.5">vs</span>
                    <span className="text-text-primary font-medium">{pair.nameB}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
