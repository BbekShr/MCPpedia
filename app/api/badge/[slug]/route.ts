import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function generateSVG(name: string, score: number): string {
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new NextResponse(generateSVG(slug, 0), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' },
    })
  }

  const supabase = createAdminClient()
  const { data: server } = await supabase
    .from('servers')
    .select('name, score_total')
    .eq('slug', slug)
    .single()

  if (!server) {
    return new NextResponse('Not found', { status: 404 })
  }

  const svg = generateSVG(server.name, server.score_total || 0)

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
