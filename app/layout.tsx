import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/constants'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

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
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'MCPpedia — The Trusted Source for MCP Servers' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@mcppedia',
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    'theme-color': '#0277b5',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} Blog`} href="/blog/feed.xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-md">
          Skip to content
        </a>
        <Nav />
        <main id="main-content" className="flex-1">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  )
}
