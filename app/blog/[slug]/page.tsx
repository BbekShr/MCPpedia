import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getBlogPost, getAllBlogPosts, type BlogCategory } from '@/lib/blog'
import { SITE_NAME, SITE_URL } from '@/lib/constants'
import { JsonLdScript, generateArticleJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'
import { MDXRemote } from 'next-mdx-remote/rsc'
import ReadingProgress from '@/components/ReadingProgress'
import NewsletterSignup from '@/components/NewsletterSignup'
import ShareButtons from '@/components/blog/ShareButtons'
import { blogComponents } from '@/components/blog'

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

export async function generateStaticParams() {
  const posts = getAllBlogPosts()
  return posts.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return { title: 'Post Not Found' }

  const { meta } = post
  const socialDescription = meta.hook || meta.description
  return {
    title: `${meta.title} - ${SITE_NAME}`,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: socialDescription,
      type: 'article',
      publishedTime: meta.date,
      tags: meta.tags,
      section: meta.category,
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: socialDescription,
    },
    alternates: {
      canonical: `${SITE_URL}/blog/${slug}`,
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  // Get related posts (same category, excluding current)
  const allPosts = getAllBlogPosts()
  const related = allPosts
    .filter(p => p.slug !== slug && p.category === post.meta.category)
    .slice(0, 2)
  if (related.length < 2) {
    const more = allPosts
      .filter(p => p.slug !== slug && !related.some(r => r.slug === p.slug))
      .slice(0, 2 - related.length)
    related.push(...more)
  }

  return (
    <>
      <JsonLdScript data={[
        generateArticleJsonLd(post.meta, post.content),
        generateBreadcrumbJsonLd([
          { name: 'Home', url: SITE_URL },
          { name: 'Blog', url: `${SITE_URL}/blog` },
          { name: post.meta.title, url: `${SITE_URL}/blog/${slug}` },
        ]),
      ]} />
      <ReadingProgress />

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-b from-bg-secondary to-bg">
        <div className="max-w-[680px] mx-auto px-4 pt-10 pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted mb-8">
            <Link href="/" className="hover:text-accent transition-colors">Home</Link>
            <span className="text-text-muted/50">/</span>
            <Link href="/blog" className="hover:text-accent transition-colors">Blog</Link>
            <span className="text-text-muted/50">/</span>
            <span className="text-text-primary font-medium truncate max-w-[300px]">{post.meta.title}</span>
          </nav>

          <div className="flex items-center gap-3 mb-5">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${categoryColors[post.meta.category]}`}>
              {categoryIcons[post.meta.category]} {categoryLabels[post.meta.category]}
            </span>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <time>{new Date(post.meta.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
              <span>·</span>
              <span>{post.meta.readingTime} min read</span>
            </div>
          </div>

          <h1 className="text-3xl md:text-[2.75rem] md:leading-[1.15] font-bold text-text-primary tracking-tight mb-5">
            {post.meta.title}
          </h1>

          {post.meta.description && (
            <p className="text-lg md:text-xl text-text-muted leading-relaxed mb-6">{post.meta.description}</p>
          )}

          <ShareButtons
            url={`${SITE_URL}/blog/${slug}`}
            title={post.meta.title}
            hook={post.meta.hook}
          />
        </div>
      </div>

      {/* Article */}
      <article className="max-w-[680px] mx-auto px-4 pt-10 pb-16">
        <div className="blog-content blog-dropcap prose prose-lg max-w-none
          text-text-primary
          prose-headings:text-text-primary prose-headings:font-bold prose-headings:tracking-tight
          prose-h2:text-[1.6rem] prose-h2:mt-14 prose-h2:mb-5 prose-h2:leading-tight
          prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4
          prose-p:leading-[1.8] prose-p:mb-5 prose-p:text-text-primary
          prose-a:text-accent prose-a:font-medium prose-a:no-underline prose-a:border-b prose-a:border-accent/30 hover:prose-a:border-accent
          prose-strong:text-text-primary prose-strong:font-bold
          prose-code:text-text-primary prose-code:bg-code-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[0.9em] prose-code:font-normal
          prose-pre:bg-code-bg prose-pre:border prose-pre:border-border prose-pre:rounded-xl prose-pre:shadow-sm
          prose-li:leading-[1.8] prose-li:text-text-primary prose-li:mb-2
          prose-ul:my-6 prose-ol:my-6
          prose-blockquote:border-l-[3px] prose-blockquote:border-accent prose-blockquote:bg-accent/[0.03] prose-blockquote:rounded-r-xl prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:not-italic prose-blockquote:text-text-primary prose-blockquote:my-8
          prose-hr:border-border prose-hr:my-12
          prose-img:rounded-xl prose-img:border prose-img:border-border prose-img:shadow-sm
        ">
          <MDXRemote source={post.content} components={blogComponents} />
        </div>

        {/* Share CTA */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">Found this useful? Share it.</p>
            <ShareButtons
              url={`${SITE_URL}/blog/${slug}`}
              title={post.meta.title}
              hook={post.meta.hook}
            />
          </div>
        </div>

        {/* Tags */}
        {post.meta.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-border">
            {post.meta.tags.map(tag => (
              <span key={tag} className="text-xs px-3 py-1.5 rounded-full border border-border text-text-muted bg-bg-secondary hover:bg-bg-tertiary transition-colors">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Featured servers */}
        {post.meta.featuredServers.length > 0 && (
          <div className="mt-8 p-6 rounded-xl bg-bg-secondary border border-border">
            <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Servers mentioned
            </h3>
            <div className="flex flex-wrap gap-2">
              {post.meta.featuredServers.map(serverSlug => (
                <Link
                  key={serverSlug}
                  href={`/s/${serverSlug}`}
                  className="text-sm px-3 py-1.5 rounded-lg border border-border text-accent hover:bg-accent/10 hover:border-accent/30 transition-all font-medium"
                >
                  {serverSlug} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Newsletter */}
        <div className="mt-10 pt-8 border-t border-border">
          <NewsletterSignup
            context="Weekly CVE alerts, new server roundups, and MCP ecosystem insights. Free."
          />
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-14 pt-10 border-t border-border">
            <h3 className="text-lg font-bold text-text-primary mb-6">Keep reading</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {related.map(r => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group p-5 rounded-xl border border-border hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px] transition-all duration-200 bg-bg"
                >
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium border mb-2.5 ${categoryColors[r.category]}`}>
                    {categoryLabels[r.category]}
                  </span>
                  <h4 className="font-semibold text-text-primary leading-snug group-hover:text-accent transition-colors mb-1.5">
                    {r.title}
                  </h4>
                  <p className="text-xs text-text-muted">{r.readingTime} min read</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* AI disclaimer */}
        <div className="mt-14 pt-6 border-t border-border flex items-start gap-3 text-xs text-text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5 opacity-60">
            <path d="M12 2a4 4 0 0 1 4 4v2h1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v2a4 4 0 0 1-8 0v-2H7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z" />
          </svg>
          <p className="leading-relaxed">
            This article was written by AI, powered by Claude and real-time MCPpedia data.
            All facts and figures are sourced from our database — but AI can make mistakes.
            If something looks off, <Link href="/about" className="text-accent hover:underline">let us know</Link>.
          </p>
        </div>
      </article>

      {/* Sticky CTA bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg/95 backdrop-blur-sm">
        <div className="max-w-[680px] mx-auto px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-text-muted hidden sm:block">Discover the safest MCP servers for your stack</p>
          <Link
            href="/servers"
            className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors whitespace-nowrap"
          >
            Search 17,500+ MCP servers &rarr;
          </Link>
        </div>
      </div>
    </>
  )
}
