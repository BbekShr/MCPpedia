import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'edge'
export const revalidate = 86400
export const alt = 'MCPpedia Server Score'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let name = slug
  let tagline = ''
  let score = 0
  let scoreSecurity = 0
  let scoreMaintenance = 0
  let scoreEfficiency = 0
  let scoreDocs = 0
  let scoreCompat = 0
  let toolCount = 0
  let transport: string[] = []
  let license = ''
  let cveCount = 0
  let hasAuth = false
  let healthStatus = 'unknown'
  let stars = 0
  let grade = 'F'

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createAdminClient()
    const { data: server } = await supabase
      .from('servers')
      .select('name, tagline, score_total, score_security, score_maintenance, score_efficiency, score_documentation, score_compatibility, tools, transport, license, cve_count, has_authentication, health_status, github_stars')
      .eq('slug', slug)
      .single()

    if (server) {
      name = server.name
      tagline = server.tagline || ''
      score = server.score_total || 0
      scoreSecurity = server.score_security || 0
      scoreMaintenance = server.score_maintenance || 0
      scoreEfficiency = server.score_efficiency || 0
      scoreDocs = server.score_documentation || 0
      scoreCompat = server.score_compatibility || 0
      toolCount = (server.tools as unknown[])?.length || 0
      transport = server.transport || []
      license = server.license || ''
      cveCount = server.cve_count || 0
      hasAuth = server.has_authentication || false
      healthStatus = server.health_status || 'unknown'
      stars = server.github_stars || 0
    }
  }

  grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  const gradeColor = score >= 80 ? '#1a7f37' : score >= 60 ? '#0969da' : score >= 40 ? '#9a6700' : '#cf222e'

  const scoreRows = [
    { label: 'Security', value: scoreSecurity, max: 30 },
    { label: 'Maintenance', value: scoreMaintenance, max: 25 },
    { label: 'Efficiency', value: scoreEfficiency, max: 20 },
    { label: 'Documentation', value: scoreDocs, max: 15 },
    { label: 'Compatibility', value: scoreCompat, max: 10 },
  ]

  const signals: string[] = []
  if (cveCount === 0) signals.push('No CVEs')
  else signals.push(`${cveCount} CVE${cveCount !== 1 ? 's' : ''}`)
  if (hasAuth) signals.push('Has auth')
  if (toolCount > 0) signals.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`)
  if (transport.length > 0) signals.push(transport.join(', '))
  if (license && license !== 'NOASSERTION') signals.push(license)
  if (stars > 0) signals.push(`${stars.toLocaleString()} stars`)

  return new ImageResponse(
    (
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          height: '100%',
          display: 'flex',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          padding: '48px 56px',
        }}
      >
        {/* Left side — info */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* MCPpedia branding */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: '#0969da',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              >
                M
              </div>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#656d76' }}>
                MCPpedia
              </span>
            </div>

            {/* Server name */}
            <div style={{ fontSize: '42px', fontWeight: 700, color: '#1f2328', lineHeight: 1.1, marginBottom: '12px' }}>
              {name.length > 35 ? name.slice(0, 35) + '...' : name}
            </div>

            {/* Tagline */}
            {tagline && (
              <div style={{ fontSize: '20px', color: '#656d76', lineHeight: 1.4, maxWidth: '550px' }}>
                {tagline.length > 100 ? tagline.slice(0, 100) + '...' : tagline}
              </div>
            )}
          </div>

          {/* Score bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '28px' }}>
            {scoreRows.map(row => {
              const pct = Math.round((row.value / row.max) * 100)
              const barColor = pct >= 70 ? '#1a7f37' : pct >= 40 ? '#9a6700' : '#cf222e'
              return (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '120px', fontSize: '14px', color: '#656d76' }}>{row.label}</div>
                  <div style={{ flex: 1, height: '14px', background: '#e8e8e8', borderRadius: '7px', overflow: 'hidden', maxWidth: '320px', display: 'flex' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '7px' }} />
                  </div>
                  <div style={{ fontSize: '13px', color: '#656d76', width: '48px', textAlign: 'right' }}>{row.value}/{row.max}</div>
                </div>
              )
            })}
          </div>

          {/* Bottom signals */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '24px' }}>
            {signals.map((s, i) => (
              <div
                key={i}
                style={{
                  fontSize: '13px',
                  color: '#656d76',
                  background: '#f6f8fa',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid #e1e4e8',
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Right side — score ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '220px' }}>
          {/* Outer ring */}
          <div
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '90px',
              background: `conic-gradient(${gradeColor} ${score * 3.6}deg, #e8e8e8 ${score * 3.6}deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '150px',
                height: '150px',
                borderRadius: '75px',
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '52px', fontWeight: 700, color: gradeColor, lineHeight: 1 }}>
                {score}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: gradeColor, marginTop: '2px' }}>
                {grade}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '14px', color: '#656d76', marginTop: '12px' }}>
            mcppedia.org
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
