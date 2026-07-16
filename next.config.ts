import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      { hostname: 'github.com' },
      { hostname: '*.githubusercontent.com' },
    ],
  },
  async redirects() {
    return [
      // Merged duplicates: keep the historical URL working as a 301 to the canonical entry.
      { source: '/s/app-thoughtspot-mcp-server', destination: '/s/thoughtspot-mcp-server', permanent: true },
      // detect-duplicates run 2026-05-04
      { source: '/s/io-github-levnikolaevich-hex-ssh-mcp', destination: '/s/io-github-levnikolaevich-hex-graph-mcp', permanent: true },
      { source: '/s/io-github-github-github-mcp-server', destination: '/s/github-mcp-server', permanent: true },
      { source: '/s/io-github-d4vinci-scrapling', destination: '/s/scrapling', permanent: true },
      { source: '/s/io-github-docfork-docfork', destination: '/s/docfork', permanent: true },
      { source: '/s/io-github-grafana-mcp-grafana', destination: '/s/mcp-grafana', permanent: true },
      { source: '/s/io-github-cherchyk-mcpbrowser', destination: '/s/io-github-cherchyk-browser', permanent: true },
      { source: '/s/io-github-austenstone-myinstants-mcp', destination: '/s/io-github-austenstone-myinstants', permanent: true },
      { source: '/s/sonarqube-mcp-server', destination: '/s/io-github-sonarsource-sonarqube-mcp-server', permanent: true },
      { source: '/s/com-cloudflare-mcp-mcp', destination: '/s/mcp-server-cloudflare', permanent: true },
      // detect-duplicates run 2026-05-11
      { source: '/s/com-xcodebuildmcp-xcodebuildmcp', destination: '/s/xcodebuildmcp', permanent: true },
      { source: '/s/com-apify-apify-mcp-server', destination: '/s/apify-mcp-server', permanent: true },
      { source: '/s/com-figma-mcp-mcp', destination: '/s/mcp-server-guide', permanent: true },
      { source: '/s/io-github-timescale-pg-aiguide', destination: '/s/pg-aiguide', permanent: true },
      { source: '/s/com-kekwanu-syncline-mcp-server', destination: '/s/com-kekwanu-syncline-mcp-server-python', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.github.com https://api.npmjs.org; frame-ancestors 'none';` },
        ],
      },
      {
        source: '/api/badge/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=3600' },
        ],
      },
    ]
  },
};

export default nextConfig;
