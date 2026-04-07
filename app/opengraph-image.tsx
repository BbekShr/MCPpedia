import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MCPpedia — The Trusted Source for MCP Servers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
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
          17,000+ servers scored on security, maintenance, and efficiency — with real CVE scanning, not opinions.
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 48, marginTop: 48, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 32 }}>
          {[
            { value: '17,000+', label: 'Servers tracked' },
            { value: '548 CVEs', label: 'Found & tracked' },
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
    { ...size }
  )
}
