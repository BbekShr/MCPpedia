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
          position: 'relative',
        }}
      >
        {/* Border rectangle */}
        <div style={{
          display: 'flex',
          position: 'absolute',
          top: 5, left: 5, right: 5, bottom: 5,
          border: '2px solid white',
          borderRadius: 5,
        }} />
        {/* Left eye */}
        <div style={{ display: 'flex', position: 'absolute', top: 10, left: 9, width: 4, height: 4, borderRadius: '50%', background: 'white' }} />
        {/* Right eye */}
        <div style={{ display: 'flex', position: 'absolute', top: 10, right: 9, width: 4, height: 4, borderRadius: '50%', background: 'white' }} />
        {/* Smile — three dots */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 7, left: 8, width: 3, height: 3, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 5, left: 14, width: 3, height: 3, borderRadius: '50%', background: 'white' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 7, right: 8, width: 3, height: 3, borderRadius: '50%', background: 'white' }} />
      </div>
    ),
    { ...size }
  )
}
