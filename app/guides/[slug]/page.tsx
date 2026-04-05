import { notFound } from 'next/navigation'
import { getGuide, getAllGuides } from '@/lib/mdx'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import type { Metadata } from 'next'
import { MDXRemote } from 'next-mdx-remote/rsc'

export async function generateStaticParams() {
  const guides = getAllGuides()
  return guides.map(g => ({ slug: g.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return { title: 'Guide Not Found' }

  const url = `${SITE_URL}/guides/${slug}`
  return {
    title: `${guide.meta.title} - ${SITE_NAME}`,
    description: guide.meta.description,
    alternates: { canonical: url },
    openGraph: {
      title: guide.meta.title,
      description: guide.meta.description,
      type: 'article',
      publishedTime: guide.meta.date,
      authors: guide.meta.author ? [guide.meta.author] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.meta.title,
      description: guide.meta.description,
    },
  }
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) notFound()

  return (
    <article className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-text-primary mb-2">{guide.meta.title}</h1>
        {guide.meta.description && (
          <p className="text-lg text-text-muted mb-4">{guide.meta.description}</p>
        )}
        <div className="flex items-center gap-3 text-sm text-text-muted">
          {guide.meta.author && <span>By {guide.meta.author}</span>}
          {guide.meta.date && (
            <span>{new Date(guide.meta.date).toLocaleDateString()}</span>
          )}
        </div>
      </header>

      <div className="prose prose-sm max-w-none text-text-primary prose-headings:text-text-primary prose-a:text-accent prose-code:text-text-primary prose-code:bg-code-bg prose-code:px-1 prose-code:rounded prose-pre:bg-code-bg prose-pre:border prose-pre:border-border">
        <MDXRemote source={guide.content} />
      </div>
    </article>
  )
}
