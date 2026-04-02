import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MCPpedia — The trusted source for MCP servers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 50%, #faf5ff 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '14px',
              background: '#0969da',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '32px',
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ fontSize: '48px', fontWeight: 700, color: '#1f2328' }}>
            MCP<span style={{ color: '#0969da' }}>pedia</span>
          </div>
        </div>
        <div
          style={{
            fontSize: '24px',
            color: '#656d76',
            textAlign: 'center',
            maxWidth: '600px',
          }}
        >
          The trusted source for MCP servers.
          Scored on security, maintenance, and efficiency.
        </div>
      </div>
    ),
    { ...size }
  )
}
