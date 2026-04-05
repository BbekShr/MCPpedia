import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0284c7',
          borderRadius: 7,
        }}
      >
        {/* Eyes */}
        <div style={{ display: 'flex', position: 'absolute', top: 9, left: 8, width: 4, height: 4, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', top: 9, right: 8, width: 4, height: 4, borderRadius: '50%', background: 'white' }} />
        {/* Smile — three dots forming arc */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 8, left: 7, width: 3, height: 3, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 6, left: 13, width: 3, height: 3, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 8, right: 7, width: 3, height: 3, borderRadius: '50%', background: 'white' }} />
      </div>
    ),
    { ...size }
  )
}
