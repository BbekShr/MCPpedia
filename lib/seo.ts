import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from './constants'
import type { Server } from './types'

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

export function generateJsonLd(server: Server) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: server.name,
    description: server.tagline || server.description || '',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    url: `${SITE_URL}/s/${server.slug}`,
    ...(server.author_name && {
      author: {
        '@type': 'Organization',
        name: server.author_name,
      },
    }),
    offers: {
      '@type': 'Offer',
      price: server.api_pricing === 'free' ? '0' : undefined,
      priceCurrency: 'USD',
    },
    ...(server.license && { license: server.license }),
  }
}
