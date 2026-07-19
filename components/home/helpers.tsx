export { Chip, Icon, SectionHeader, formatNumber, grade, gradeColor } from '@/components/server/helpers'

/** Collapse whitespace + strip HTML from a tagline. Returns null if empty. */
export function stripTagline(html: string | null | undefined): string | null {
  if (!html) return null
  const s = html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s || null
}

export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
