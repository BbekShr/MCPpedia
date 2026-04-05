import Link from 'next/link'
import { getAllGuides } from '@/lib/mdx'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Guides',
  description: 'Learn about MCP servers — what they are, how to set them up, and which ones to use.',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mcppedia.org'}/guides` },
}

export default function GuidesPage() {
  const guides = getAllGuides()

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-2">Guides</h1>
      <p className="text-text-muted mb-8">
        Learn about MCP servers — what they are, how to set them up, and which ones to use.
      </p>

      <div className="space-y-6">
        {guides.map(guide => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="block border border-border rounded-md p-5 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-150"
          >
            <h2 className="font-semibold text-text-primary mb-1">{guide.title}</h2>
            {guide.description && (
              <p className="text-sm text-text-muted mb-2">{guide.description}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-text-muted">
              {guide.author && <span>By {guide.author}</span>}
              {guide.date && <span>{new Date(guide.date).toLocaleDateString()}</span>}
            </div>
          </Link>
        ))}
      </div>

      {guides.length === 0 && (
        <p className="text-text-muted">No guides available yet.</p>
      )}
    </div>
  )
}
