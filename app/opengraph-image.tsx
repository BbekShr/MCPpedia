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
          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#0284c7', display: 'flex', position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 12, left: 11, width: 10, height: 10, borderRadius: '50%', background: 'white', display: 'flex' }} />
            <div style={{ position: 'absolute', top: 12, right: 11, width: 10, height: 10, borderRadius: '50%', background: 'white', display: 'flex' }} />
            <div style={{ position: 'absolute', bottom: 11, left: 10, width: 7, height: 7, borderRadius: '50%', background: 'white', display: 'flex' }} />
            <div style={{ position: 'absolute', bottom: 8, left: 22, width: 7, height: 7, borderRadius: '50%', background: 'white', display: 'flex' }} />
            <div style={{ position: 'absolute', bottom: 11, right: 10, width: 7, height: 7, borderRadius: '50%', background: 'white', display: 'flex' }} />
          </div>
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
