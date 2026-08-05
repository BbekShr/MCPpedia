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
  '/apple-icon',
]

// The OG image routes used to be listed above. They are not: the server-page
// JSON-LD points `image` at /s/<slug>/opengraph-image, and Google requires the
// schema image be crawlable or the page is ineligible for rich results and
// Discover. Twitterbot also honours robots.txt, so disallowing them broke X and
// LinkedIn previews across the whole catalog plus every blog post.
//
// The original reason for the disallow was the 184 5xx errors Search Console
// attributed to /s/*/opengraph-image. Those were load-related; the routes now
// return 200 image/png, so the disallow is no longer buying anything.
//
// Deliberately NOT paired with `X-Robots-Tag: noindex` on the image route:
// Google's structured-data guidance requires the `image` be crawlable AND
// indexable, so a noindex header would reintroduce the same ineligibility by
// another door. These are 1200x630 renders; letting them sit in Google Images
// costs nothing.

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
