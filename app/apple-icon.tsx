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
          background: 'white',
        }}
      >
        <svg width="160" height="160" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="#0284c7" strokeWidth="2" />
          <circle cx="8.5" cy="9.5" r="1.5" fill="#0284c7" />
          <circle cx="15.5" cy="9.5" r="1.5" fill="#0284c7" />
          <path d="M8 15c1 1.5 3 2.5 4 2.5s3-1 4-2.5" stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
