import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0284c7',
          borderRadius: 40,
        }}
      >
        {/* Eyes */}
        <div style={{ display: 'flex', position: 'absolute', top: 52, left: 46, width: 22, height: 22, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', top: 52, right: 46, width: 22, height: 22, borderRadius: '50%', background: 'white' }} />
        {/* Smile */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 44, left: 40, width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 33, left: 74, width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 44, right: 40, width: 16, height: 16, borderRadius: '50%', background: 'white' }} />
      </div>
    ),
    { ...size }
  )
}
