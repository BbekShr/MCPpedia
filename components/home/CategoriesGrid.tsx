import Link from 'next/link'
import { formatNumber, SectionHeader } from './helpers'

export interface HomeCategory {
  slug: string
  label: string
  count: number
  hot?: boolean
}

export default function CategoriesGrid({ categories }: { categories: HomeCategory[] }) {
  return (
    <section style={{ padding: 'var(--section-pad) 0' }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <SectionHeader
          eyebrow="Taxonomy"
          title="Browse by category"
          desc="Every server is tagged with at least one category. The catalog grows daily."
          right={
            <Link
              href="/servers"
              className="text-[13px] text-accent"
            >
              All categories →
            </Link>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {categories.map(c => (
            <Link
              key={c.slug}
              href={`/category/${encodeURIComponent(c.slug)}`}
              className="cat-tile flex items-center justify-between px-3 py-2.5 rounded-md bg-bg text-text-primary text-[13px]"
              style={{ border: '1px solid var(--border)' }}
            >
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="truncate">{c.label}</span>
                {c.hot && (
                  <span
                    className="font-mono uppercase font-semibold shrink-0"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: '0.06em',
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: 'color-mix(in srgb, var(--red) 12%, transparent)',
                      color: 'var(--red)',
                    }}
                  >
                    Hot
                  </span>
                )}
              </span>
              <span className="font-mono text-[11.5px] text-text-muted shrink-0">
                {formatNumber(c.count)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
