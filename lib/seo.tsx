import { SITE_NAME, SITE_URL, SITE_DESCRIPTION, CATEGORY_LABELS, type Category } from './constants'
import { normalizeServerName } from './server-name'
import type { Server } from './types'
import type { BlogMeta } from './blog'

// ── Index quality gate ──────────────────────────────────────────────

// The catalog is ~36.5k servers but most rows are registry stubs with no
// description, no tools and a near-zero score. Submitting all of them left
// 15,056 URLs in Search Console's "Crawled – currently not indexed" bucket,
// which is a site-wide quality signal, not a per-URL one — the thin pages drag
// down the crawl budget of the ones we actually want ranked.
//
// This is the SINGLE source of truth for "should Google index this server?".
// Both the `robots` meta tag in app/s/[slug]/page.tsx and the server sitemap
// shards read it, so the two can never disagree — a URL in the sitemap that
// renders `noindex` is the worst of both worlds.
//
// Calibration against the live catalog (36,477 rows): 13,383 score >= 40,
// 4,302 >= 60. The `description` clause is what carries most of the passing
// set — a written description is the cheapest honest proxy for "there is
// something on this page worth reading".
export interface IndexableServerFields {
  description?: string | null
  tool_count?: number | null
  score_total?: number | null
  is_archived?: boolean | null
  review_count?: number | null
  community_verified?: boolean | null
}

// Columns `isServerIndexable` reads. Kept next to the predicate so every caller
// selects exactly what the gate needs and nothing more.
export const INDEXABLE_FIELD_LIST = [
  'description',
  'tool_count',
  'score_total',
  'is_archived',
  'review_count',
  'community_verified',
] as const

export const INDEXABLE_FIELDS = INDEXABLE_FIELD_LIST.join(', ')

export function isServerIndexable(server: IndexableServerFields): boolean {
  if (server.is_archived) return false

  const score = server.score_total ?? 0
  const toolCount = server.tool_count ?? 0

  if ((server.description ?? '').trim().length > 0) return true
  if (toolCount > 0 && score >= 40) return true
  if (score >= 60) return true
  if ((server.review_count ?? 0) > 0) return true
  if (server.community_verified) return true

  return false
}

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

// Dataset describes the catalog itself — gives answer engines (Perplexity,
// ChatGPT, Claude, Gemini Overviews) a concrete, citable data source they can
// attribute when summarizing "MCP server catalogs". Numbers in `keywords` and
// `description` get extracted as facts.
export function generateDatasetJsonLd(stats: {
  totalServers: number
  officialCount: number
  openCves: number
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${SITE_NAME} MCP Server Catalog`,
    description: `Independent, structured catalog of ${stats.totalServers.toLocaleString()} Model Context Protocol (MCP) servers. Each entry is scored on security (CVE scanning, tool poisoning, auth), maintenance, documentation, compatibility, and token efficiency. ${stats.officialCount.toLocaleString()} servers are vendor-official; ${stats.openCves.toLocaleString()} have open CVEs.`,
    url: SITE_URL,
    keywords: [
      'MCP servers', 'Model Context Protocol', 'AI agent tools',
      'Claude Desktop', 'Cursor', 'Claude Code', 'Windsurf',
      'CVE scanning', 'tool poisoning detection',
    ],
    license: 'https://creativecommons.org/licenses/by/4.0/',
    creator: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/xml',
        contentUrl: `${SITE_URL}/sitemap.xml`,
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/plain',
        contentUrl: `${SITE_URL}/llms-full.txt`,
      },
    ],
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
    name: normalizeServerName(server.name),
    description: server.tagline || server.description || `${normalizeServerName(server.name)} MCP Server`,
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

// ── Server title & description ──────────────────────────────────────

// The old title was `Mcp Hn — Score: 74/100 (B) - MCPpedia`. Three things wrong
// with it, all of which show up in a 0.3% CTR:
//   - "Mcp Hn" is the data pipeline's title-casing, not a name (see
//     lib/server-name.ts).
//   - The score led the title, so the most volatile number on the page sat in
//     front of the keywords and rewrote the <title> on every recompute. Google
//     re-learns a churning title instead of trusting it.
//   - Nothing in it said what the page was FOR. "MCP server", "Claude",
//     "Cursor" are the words people actually type.
//
// Google truncates the SERP title around 60 characters, so the pattern degrades
// through progressively shorter forms rather than emitting one long string and
// hoping. `{Name} — {Category} MCP Server for Claude & Cursor | MCPpedia` when
// it fits, down to `{Name} | MCPpedia` for a long name.
export const SERVER_TITLE_MAX = 60
export const SERVER_DESCRIPTION_MAX = 155

export interface ServerTitleFields {
  name: string
  categories?: string[] | null
}

export interface ServerDescriptionFields {
  name: string
  tagline?: string | null
  tool_count?: number | null
  transport?: string | null
  score_total?: number | null
  categories?: string[] | null
}

function primaryCategoryLabel(categories: string[] | null | undefined): string | null {
  const first = categories?.[0]
  if (!first) return null
  return CATEGORY_LABELS[first as Category] ?? null
}

export function buildServerTitle(server: ServerTitleFields): string {
  const name = normalizeServerName(server.name)
  const category = primaryCategoryLabel(server.categories)
  // A name that already says "MCP server" should not say it twice.
  const saysMcpServer = /mcp[\s-]*server/i.test(name)

  // Ordered longest-first. When something has to go it is "for Claude & Cursor"
  // before the category: that clause is identical on every page, while the
  // category is the part that distinguishes this title from 36k others.
  const candidates = saysMcpServer
    ? [`${name} for Claude & Cursor`, name]
    : [
        category && `${name} — ${category} MCP Server for Claude & Cursor`,
        category && `${name} — ${category} MCP Server`,
        `${name} — MCP Server for Claude & Cursor`,
        `${name} — MCP Server`,
        name,
      ].filter((c): c is string => typeof c === 'string' && c.length > 0)

  const suffix = ` | ${SITE_NAME}`
  const fitting = candidates.find(c => c.length + suffix.length <= SERVER_TITLE_MAX)
  // Nothing fits: the name alone is already over budget. Emit it anyway rather
  // than truncating a name mid-word — Google will clip the tail itself.
  return `${fitting ?? candidates[candidates.length - 1]}${suffix}`
}

// Taglines come from package registries and can carry HTML; a description is
// plain text.
function plain(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Every one of 36k pages used to carry the same two sentence shapes with the
// numbers swapped, which is the definition of boilerplate. This builds from
// whatever real data the row actually has and drops the clauses it does not,
// so two servers only read alike when they genuinely are alike.
export function buildServerDescription(server: ServerDescriptionFields): string {
  const facts: string[] = []
  const toolCount = server.tool_count ?? 0
  if (toolCount > 0) facts.push(`${toolCount} tool${toolCount === 1 ? '' : 's'}`)
  if (server.transport) facts.push(`${server.transport} transport`)
  const score = server.score_total ?? 0
  if (score > 0) facts.push(`score ${score}/100`)

  const tail = 'Install config for Claude Desktop, Cursor & Claude Code.'
  const factSentence = facts.length ? `${facts.join(', ')}.` : ''
  // Capitalize the leading fact when it is the first thing in the sentence.
  const factsFirst = factSentence.charAt(0).toUpperCase() + factSentence.slice(1)

  const rawTagline = server.tagline ? plain(server.tagline) : ''
  const lead = rawTagline ? (/[.!?]$/.test(rawTagline) ? rawTagline : `${rawTagline}.`) : ''

  const withoutLead = [factsFirst, tail].filter(Boolean).join(' ')
  if (!lead) {
    // No tagline at all: name the thing so the description is not identical to
    // every other tagline-less server in the same shape.
    const fallbackLead = `${normalizeServerName(server.name)} is an MCP server.`
    return clampToSentence(`${fallbackLead} ${withoutLead}`, SERVER_DESCRIPTION_MAX)
  }

  const full = `${lead} ${withoutLead}`
  if (full.length <= SERVER_DESCRIPTION_MAX) return full

  // Over budget: shorten the tagline rather than the facts, which are what make
  // the description distinct from its neighbours.
  const budget = SERVER_DESCRIPTION_MAX - withoutLead.length - 1
  const trimmedLead = clampToSentence(lead, Math.max(budget, 0))
  return trimmedLead ? `${trimmedLead} ${withoutLead}` : withoutLead
}

// Cut at a word boundary and mark the cut, so a truncated description never
// ends mid-word.
function clampToSentence(text: string, max: number): string {
  if (text.length <= max) return text
  if (max <= 1) return ''
  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, '')}…`
}
