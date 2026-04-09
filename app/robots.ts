import { SITE_URL } from '@/lib/constants'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/', '/api/', '/auth/', '/login', '/my-servers', '/unsubscribed'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
