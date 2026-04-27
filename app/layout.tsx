import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import CompareTray from '@/components/CompareTray'
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/constants'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

// Root opengraph-image + icon are auto-wired from the file-convention files at
// app/opengraph-image.tsx and app/icon.svg / app/favicon.ico / app/apple-icon.tsx.
// Don't declare them again here — it would duplicate the tags.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — The Trusted Source for MCP Servers`,
    template: `%s - ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@MCPpedia',
    creator: '@MCPpedia',
  },
  // No `robots` here. Next.js defaults to indexable, and explicit
  // `index, follow` ends up duplicated next to the `noindex` meta that the
  // streamed not-found shell injects — see the Next.js loading docs note on
  // "soft 404s" with streaming. Pages that need to opt out (edit/history/
  // not-found) declare their own `robots` metadata locally.
}

export const viewport: Viewport = {
  themeColor: '#0277b5',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} Blog`} href="/blog/feed.xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-accent-fg focus:rounded-md">
          Skip to content
        </a>
        <Nav />
        <main id="main-content" className="flex-1">{children}</main>
        <Footer />
        <CompareTray />
        <Analytics />
      </body>
    </html>
  )
}
