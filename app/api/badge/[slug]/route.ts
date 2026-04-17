import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function generateScoreSVG(rawName: string, score: number): string {
  const name = escapeXml(rawName)
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
  const color = score >= 80 ? '#1a7f37' : score >= 60 ? '#0969da' : score >= 40 ? '#9a6700' : '#cf222e'

  const labelWidth = 90
  const valueText = `${score}/100 (${grade})`
  const valueWidth = 80
  const totalWidth = labelWidth + valueWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="MCPpedia Score: ${score}">
  <title>MCPpedia Score: ${score}/100 (${grade})</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">MCPpedia</text>
    <text x="${labelWidth / 2}" y="14">MCPpedia</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${valueText}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${valueText}</text>
  </g>
</svg>`
}

function generateSecuritySVG(secScore: number, cveCount: number): string {
  const grade = secScore >= 27 ? 'A' : secScore >= 21 ? 'B' : secScore >= 15 ? 'C' : secScore >= 9 ? 'D' : 'F'
  const color = secScore >= 27 ? '#1a7f37' : secScore >= 21 ? '#0969da' : secScore >= 15 ? '#9a6700' : '#cf222e'

  const labelWidth = 80
  const cveText = cveCount === 0 ? 'no CVEs' : `${cveCount} CVE${cveCount !== 1 ? 's' : ''}`
  const valueText = `${grade} · ${cveText}`
  const valueWidth = cveCount === 0 ? 72 : 80 + (cveCount > 9 ? 8 : 0)
  const totalWidth = labelWidth + valueWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="MCPpedia Security: ${grade}">
  <title>MCPpedia Security: ${grade} (${cveText})</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">security</text>
    <text x="${labelWidth / 2}" y="14">security</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${valueText}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${valueText}</text>
  </g>
</svg>`
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const svg = type === 'security' ? generateSecuritySVG(0, 0) : generateScoreSVG(slug, 0)
    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' },
    })
  }

  const supabase = createAdminClient('badge-render')
  const { data: server } = await supabase
    .from('servers')
    .select('name, score_total, score_security, cve_count')
    .eq('slug', slug)
    .single()

  if (!server) {
    return new NextResponse('Not found', { status: 404 })
  }

  const svg = type === 'security'
    ? generateSecuritySVG(server.score_security || 0, server.cve_count || 0)
    : generateScoreSVG(server.name, server.score_total || 0)

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
