import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from './constants'
import type { Server } from './types'
import type { BlogMeta } from './blog'

// ── JSON-LD Script Component ────────────────────────────────────────

export function JsonLdScript({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const items = Array.isArray(data) ? data : [data]
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, '\\u003C').replace(/>/g, '\\u003E').replace(/&/g, '\\u0026') }}
        />
      ))}
    </>
  )
}

// ── Organization & WebSite (Homepage) ───────────────────────────────

export function generateOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description: SITE_DESCRIPTION,
  }
}

export function generateWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/servers?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

// ── Breadcrumbs ─────────────────────────────────────────────────────

export function generateBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

// ── Article (Blog Posts) ────────────────────────────────────────────

export function generateArticleJsonLd(post: BlogMeta, content?: string) {
  const wordCount = content
    ? content.trim().split(/\s+/).length
    : post.readingTime * 238
  const articleUrl = `${SITE_URL}/blog/${post.slug}`
  const image = {
    '@type': 'ImageObject',
    url: `${articleUrl}/opengraph-image`,
    width: 1200,
    height: 630,
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    wordCount,
    articleSection: post.category,
    keywords: post.tags,
    image,
    author: {
      '@type': 'Person',
      name: 'MCPpedia Editorial',
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/icon.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
  }
}

// ── CollectionPage (Listings) ───────────────────────────────────────

export function generateCollectionJsonLd(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
  }
}

// ── SoftwareApplication (Server Detail) ─────────────────────────────

export function generateServerJsonLd(server: Server) {
  const reviewCount = server.review_count || 0
  const reviewAvg = server.review_avg || 0
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: server.name,
    description: server.tagline || server.description || `${server.name} MCP Server`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    url: `${SITE_URL}/s/${server.slug}`,
    ...(server.npm_package && { installUrl: `https://www.npmjs.com/package/${server.npm_package}` }),
    ...(server.pip_package && { installUrl: `https://pypi.org/project/${server.pip_package}` }),
    ...(server.license && server.license !== 'NOASSERTION' && { license: server.license }),
    ...(server.github_url && { codeRepository: server.github_url }),
    ...(server.author_name && {
      author: {
        '@type': 'Organization',
        name: server.author_name,
      },
    }),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    ...(reviewCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: reviewAvg.toFixed(1),
        bestRating: '5',
        worstRating: '1',
        ratingCount: reviewCount,
      },
    }),
  }
}

// ── FAQPage (Server Detail) ──────────────────────────────────────────

export interface FAQItem {
  question: string
  answer: string
}

export function generateFAQJsonLd(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

// ── ItemList (Category / Listing Pages) ─────────────────────────────

export function generateItemListJsonLd(items: { name: string; url: string; description?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url,
      ...(item.description && { description: item.description }),
    })),
  }
}

// ── Metadata Helpers ────────────────────────────────────────────────

export function generateServerMetadata(server: Server): Metadata {
  const toolCount = server.tools?.length || 0
  const description = server.tagline
    ? `${server.tagline}. ${toolCount} tools. Compatible with Claude Desktop, Cursor, and Claude Code.`
    : `${server.name} MCP Server with ${toolCount} tools.`

  return {
    title: `${server.name} - ${SITE_NAME}`,
    description,
    openGraph: {
      title: `${server.name} - ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/s/${server.slug}`,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${server.name} - ${SITE_NAME}`,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/s/${server.slug}`,
    },
  }
}
