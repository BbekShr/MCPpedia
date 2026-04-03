import { ImageResponse } from 'next/og'
import { getBlogPost } from '@/lib/blog'

export const runtime = 'nodejs'
export const alt = 'MCPpedia Blog'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const categoryColors: Record<string, { bg: string; text: string; tint: string }> = {
  'weekly-roundup': { bg: '#e0f2fe', text: '#0284c7', tint: '#0969da' },
  'server-spotlight': { bg: '#dcfce7', text: '#15803d', tint: '#1a7f37' },
  'security-alert': { bg: '#fee2e2', text: '#dc2626', tint: '#cf222e' },
  'trending': { bg: '#fef3c7', text: '#92400e', tint: '#9a6700' },
  'category-deep-dive': { bg: '#e0f2fe', text: '#0284c7', tint: '#0969da' },
}

const categoryLabels: Record<string, string> = {
  'weekly-roundup': 'Weekly Roundup',
  'server-spotlight': 'Server Spotlight',
  'security-alert': 'Security Alert',
  'trending': 'Trending',
  'category-deep-dive': 'Deep Dive',
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getBlogPost(slug)

  const title = post?.meta.title || slug
  const hook = post?.meta.hook || ''
  const category = post?.meta.category || 'weekly-roundup'
  const date = post?.meta.date
    ? new Date(post.meta.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const readingTime = post?.meta.readingTime || 3
  const tags = post?.meta.tags || []
  const colors = categoryColors[category] || categoryColors['weekly-roundup']

  return new ImageResponse(
    (
      <div
        style={{
          background: `linear-gradient(135deg, ${colors.bg} 0%, #ffffff 50%, #f8fafc 100%)`,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          padding: '56px 64px',
        }}
      >
        {/* Top — branding + category */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#0969da',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              M
            </div>
            <div style={{ display: 'flex', fontSize: '20px', fontWeight: 600, color: '#656d76' }}>MCPpedia Blog</div>
          </div>
          <div
            style={{
              display: 'flex',
              background: colors.bg,
              color: colors.text,
              fontSize: '16px',
              fontWeight: 600,
              padding: '6px 16px',
              borderRadius: '20px',
              border: `1.5px solid ${colors.tint}33`,
            }}
          >
            {categoryLabels[category] || category}
          </div>
        </div>

        {/* Middle — title + hook */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', maxWidth: '900px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 60 ? '38px' : '46px',
              fontWeight: 700,
              color: '#1f2328',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {title.length > 80 ? title.slice(0, 80) + '...' : title}
          </div>
          {hook && (
            <div
              style={{
                display: 'flex',
                fontSize: '18px',
                color: '#656d76',
                lineHeight: 1.5,
                marginTop: '16px',
                maxWidth: '750px',
              }}
            >
              {hook.length > 130 ? hook.slice(0, 130) + '...' : hook}
            </div>
          )}
        </div>

        {/* Bottom — date, reading time, tags */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16px', color: '#656d76' }}>
            <div style={{ display: 'flex' }}>{date}</div>
            <div style={{ display: 'flex' }}>·</div>
            <div style={{ display: 'flex' }}>{readingTime} min read</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {tags.slice(0, 3).map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  fontSize: '14px',
                  color: '#656d76',
                  background: '#f6f8fa',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  border: '1px solid #e1e4e8',
                }}
              >
                #{tag}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
