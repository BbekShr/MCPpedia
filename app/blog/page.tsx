import Link from 'next/link'
import { getAllBlogPosts, type BlogCategory } from '@/lib/blog'
import { SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateCollectionJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo'
import NewsletterSignup from '@/components/NewsletterSignup'
import type { Metadata } from 'next'

const blogDescription = 'Weekly insights on the MCP ecosystem — new servers, trending projects, security alerts, and deep dives.'

export const metadata: Metadata = {
  title: 'Blog',
  description: blogDescription,
  openGraph: {
    title: 'Blog',
    description: blogDescription,
    type: 'website',
    url: `${SITE_URL}/blog`,
  },
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
}

const categoryLabels: Record<BlogCategory, string> = {
  'weekly-roundup': 'Weekly Roundup',
  'server-spotlight': 'Server Spotlight',
  'security-alert': 'Security Alert',
  'trending': 'Trending',
  'category-deep-dive': 'Deep Dive',
}

const categoryColors: Record<BlogCategory, string> = {
  'weekly-roundup': 'bg-accent/10 text-accent border-accent/20',
  'server-spotlight': 'bg-green/10 text-green border-green/20',
  'security-alert': 'bg-red/10 text-red border-red/20',
  'trending': 'bg-yellow/10 text-yellow border-yellow/20',
  'category-deep-dive': 'bg-accent/10 text-accent border-accent/20',
}

const categoryIcons: Record<BlogCategory, string> = {
  'weekly-roundup': '📡',
  'server-spotlight': '🔦',
  'security-alert': '🛡️',
  'trending': '📈',
  'category-deep-dive': '🔬',
}

export default function BlogPage() {
  const posts = getAllBlogPosts()
  const [featured, ...rest] = posts

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-10">
      <JsonLdScript data={[
        generateCollectionJsonLd('MCPpedia Blog', blogDescription, `${SITE_URL}/blog`),
        generateBreadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: 'Blog', url: `${SITE_URL}/blog` },
        ]),
      ]} />
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight mb-2">Blog</h1>
        <p className="text-lg text-text-muted max-w-2xl">
          Weekly insights on the MCP ecosystem — new servers, trending projects, security alerts, and deep dives. All auto-generated from real data.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📝</p>
          <p className="text-text-muted text-lg">No posts yet. Check back soon.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Featured post — full width hero card */}
          {featured && (
            <Link
              href={`/blog/${featured.slug}`}
              className="group block rounded-xl border border-border bg-gradient-to-br from-bg-secondary to-bg overflow-hidden hover:shadow-[var(--shadow-lg)] hover:-translate-y-[2px] transition-all duration-200"
            >
              <div className="p-8 md:p-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${categoryColors[featured.category]}`}>
                    {categoryIcons[featured.category]} {categoryLabels[featured.category]}
                  </span>
                  <span className="text-xs text-text-muted">
                    {new Date(featured.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-text-muted">·</span>
                  <span className="text-xs text-text-muted">{featured.readingTime} min read</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-3 tracking-tight group-hover:text-accent transition-colors">
                  {featured.title}
                </h2>
                {featured.description && (
                  <p className="text-base text-text-muted max-w-2xl leading-relaxed mb-4">{featured.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-accent group-hover:underline">Read article →</span>
                </div>
              </div>
            </Link>
          )}

          {/* Remaining posts — 2-col grid */}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {rest.map(post => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col rounded-xl border border-border p-6 bg-bg hover:shadow-[var(--shadow-md)] hover:-translate-y-[2px] transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryColors[post.category]}`}>
                      {categoryIcons[post.category]} {categoryLabels[post.category]}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-text-primary mb-2 leading-snug group-hover:text-accent transition-colors">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="text-sm text-text-muted line-clamp-2 mb-4 leading-relaxed flex-1">{post.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-auto pt-3 border-t border-border">
                    <span>
                      {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span>·</span>
                    <span>{post.readingTime} min read</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Newsletter */}
      <div className="mt-12">
        <NewsletterSignup
          variant="banner"
          context="Get weekly MCP security alerts and new server roundups delivered to your inbox."
        />
      </div>
    </div>
  )
}
