// Cloudflare Web Analytics — the replacement for @vercel/analytics after the
// move off Vercel. It is a single privacy-preserving beacon (no cookies), and
// unlike the Vercel package it needs an explicit site token, so it renders
// nothing when NEXT_PUBLIC_CF_ANALYTICS_TOKEN is unset (local dev, CI builds,
// preview). The token is not a secret — it is public by design, which is why it
// carries the NEXT_PUBLIC_ prefix.
//
// The CSP in next.config.ts must keep static.cloudflareinsights.com in
// `script-src` and cloudflareinsights.com in `connect-src` or the beacon is
// blocked and no pageviews are recorded.
export default function WebAnalytics() {
  const token = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN
  if (!token) return null

  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  )
}
