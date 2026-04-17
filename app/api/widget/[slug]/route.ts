import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function scoreGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function gradeColor(score: number): string {
  if (score >= 80) return '#1a7f37'
  if (score >= 60) return '#0277b5'
  if (score >= 40) return '#9a6700'
  return '#cf222e'
}

/**
 * GET /api/widget/[slug] — returns an embeddable SVG widget showing MCPpedia score
 *
 * Query params:
 *   style: "flat" (default) | "detailed"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const style = request.nextUrl.searchParams.get('style') || 'flat'
  const supabase = await createClient()

  const { data: server } = await supabase
    .from('servers')
    .select('name, score_total, cve_count, health_status, score_security, score_maintenance')
    .eq('slug', slug)
    .single()

  if (!server) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="20">
      <text x="5" y="14" font-family="sans-serif" font-size="11" fill="#656d76">Server not found</text>
    </svg>`
    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' },
    })
  }

  const score = server.score_total || 0
  const grade = scoreGrade(score)
  const color = gradeColor(score)
  const cves = server.cve_count || 0

  let svg: string

  if (style === 'detailed') {
    // Detailed widget: shows score, grade, CVEs, health
    const width = 280
    const height = 80
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <style>
          .bg { fill: #ffffff; stroke: #d0d7de; stroke-width: 1; rx: 8; }
          .title { font: bold 13px -apple-system, BlinkMacSystemFont, sans-serif; fill: #1f2328; }
          .label { font: 11px -apple-system, BlinkMacSystemFont, sans-serif; fill: #656d76; }
          .value { font: bold 12px -apple-system, BlinkMacSystemFont, sans-serif; }
          .score { fill: ${color}; }
          .badge { font: bold 20px -apple-system, BlinkMacSystemFont, sans-serif; fill: ${color}; }
          .powered { font: 9px -apple-system, BlinkMacSystemFont, sans-serif; fill: #8b949e; }
        </style>
      </defs>
      <rect class="bg" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" />
      <text class="title" x="12" y="22">${escapeXml(server.name)}</text>
      <text class="badge" x="12" y="52">${score}</text>
      <text class="label" x="50" y="46">/ 100</text>
      <text class="label" x="50" y="58">Grade ${grade}</text>
      <text class="label" x="130" y="46">CVEs: <tspan class="value ${cves === 0 ? 'score' : ''}" style="fill: ${cves === 0 ? '#1a7f37' : '#cf222e'}">${cves}</tspan></text>
      <text class="label" x="130" y="58">Status: <tspan class="value">${escapeXml(server.health_status || 'unknown')}</tspan></text>
      <text class="powered" x="12" y="${height - 6}">Verified by MCPpedia.org</text>
    </svg>`
  } else {
    // Flat badge style (similar to shields.io)
    const labelText = 'MCPpedia'
    const valueText = `${score}/100 ${grade}`
    const labelWidth = 62
    const valueWidth = 70
    const totalWidth = labelWidth + valueWidth

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" viewBox="0 0 ${totalWidth} 20">
      <linearGradient id="s" x2="0" y2="100%">
        <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
        <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
        <stop offset=".9" stop-color="#000" stop-opacity=".3"/>
        <stop offset="1" stop-color="#000" stop-opacity=".5"/>
      </linearGradient>
      <clipPath id="r">
        <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
      </clipPath>
      <g clip-path="url(#r)">
        <rect width="${labelWidth}" height="20" fill="#555"/>
        <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
        <rect width="${totalWidth}" height="20" fill="url(#s)"/>
      </g>
      <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-rendering="geometricPrecision">
        <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${labelText}</text>
        <text x="${labelWidth / 2}" y="14">${labelText}</text>
        <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${valueText}</text>
        <text x="${labelWidth + valueWidth / 2}" y="14">${valueText}</text>
      </g>
    </svg>`
  }

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
