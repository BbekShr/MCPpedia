import { ImageResponse } from 'next/og'
import { getCatalogCounts, formatApproxTotal, formatExactCount } from '@/lib/live-counts'

// Deliberately NOT `runtime = 'edge'`: this route reads home_stats, and on the
// edge runtime the segment `revalidate` below is inert, which is what made this
// image a per-request DB call plus a satori render on every unfurl (S91). Do
// not re-add it.
export const revalidate = 86400 // 1d — matches the home_stats snapshot's daily refresh
export const alt = 'MCPpedia — The Trusted Source for MCP Servers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Live count: this image is the site's link preview everywhere it is shared,
  // and it claimed "17,000+" against a real catalog of 36,000+.
  const { totalServers, openCves, failed } = await getCatalogCounts()
  // A failed read must NOT be cached. This route is ISR'd (revalidate above), and
  // Next only persists SUCCESSFUL responses — so throwing here leaves the last good
  // PNG in place instead of baking degraded copy for a day. Unreachable in the
  // env-less CI build: the no-env short-circuit in getCatalogCounts returns
  // failed:false before it ever issues an RPC.
  if (failed) throw new Error('opengraph-image: home_stats unavailable, refusing to cache a degraded card')
  const catalogSize = formatApproxTotal(totalServers, 'Thousands of')
  // "Thousands of" reads as a fragment as a bare stat value, so the tile gets its own phrasing.
  const catalogTile = formatApproxTotal(totalServers, 'Thousands')
  // The guard must match formatExactCount's own fallback rule (`n <= 0`), or at exactly
  // 0 the value falls back to 'OSV.dev' while the label still says 'Open CVEs'.
  const cveTile =
    openCves !== null && openCves > 0
      ? { value: formatExactCount(openCves, 'OSV.dev'), label: 'Open CVEs' }
      : { value: 'OSV.dev', label: 'CVE source' }

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #e0f2fe 0%, #f8fafc 50%, #f5f3ff 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '64px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '48px' }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="#0284c7" strokeWidth="2" />
            <circle cx="8.5" cy="9.5" r="1.5" fill="#0284c7" />
            <circle cx="15.5" cy="9.5" r="1.5" fill="#0284c7" />
            <path d="M8 15c1 1.5 3 2.5 4 2.5s3-1 4-2.5" stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#1f2328', letterSpacing: '-0.02em' }}>
            MCP<span style={{ color: '#0284c7' }}>pedia</span>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', fontSize: 62, fontWeight: 800, color: '#1f2328', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 24, maxWidth: 880 }}>
          The Trusted Source for MCP Servers
        </div>

        {/* Subheading */}
        <div style={{ display: 'flex', fontSize: 24, color: '#656d76', lineHeight: 1.5, maxWidth: 780, marginBottom: 'auto' }}>
          {`${catalogSize} servers scored on security, maintenance, and efficiency — with real CVE scanning, not opinions.`}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 48, marginTop: 48, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 32 }}>
          {[
            { value: catalogTile, label: 'Servers tracked' },
            cveTile,
            { value: '100pt', label: 'Quality score' },
            { value: 'Daily', label: 'Security scans' },
          ].map(stat => (
            <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: '#0284c7' }}>{stat.value}</div>
              <div style={{ display: 'flex', fontSize: 15, color: '#656d76' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } }
  )
}
