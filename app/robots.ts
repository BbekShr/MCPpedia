import { SITE_URL } from '@/lib/constants'
import type { MetadataRoute } from 'next'

const PRIVATE_PATHS = [
  '/admin',
  '/admin/',
  '/api/',
  '/auth/',
  '/login',
  '/my-servers',
  '/profile',
  '/profile/',
  '/unsubscribed',
  '/s/*/edit',
  '/s/*/history',
  // Account/onboarding flows with nothing to rank and a session dependency.
  '/welcome',
  '/setup',
  '/s/*/claim',
  // OG images. Social crawlers fetch these from the <meta> tag regardless of
  // robots.txt, so nothing that needs them loses them — but Google was
  // crawling them as pages, and all 184 of Search Console's 5xx errors are
  // /s/*/opengraph-image. They are 1200x630 renders, not documents.
  '/apple-icon',
  '/*/opengraph-image',
  '/s/*/opengraph-image',
  '/blog/*/opengraph-image',
]

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'cohere-ai',
  'Meta-ExternalAgent',
  'Amazonbot',
  'DuckAssistBot',
  'YouBot',
  'Diffbot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
