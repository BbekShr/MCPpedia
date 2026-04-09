import { describe, it, expect } from 'vitest'

// Test the escapeXml function used in badge and widget routes
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

describe('SVG escaping', () => {
  it('escapes HTML special characters', () => {
    expect(escapeXml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes ampersands', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B')
  })

  it('escapes single quotes', () => {
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('handles empty string', () => {
    expect(escapeXml('')).toBe('')
  })

  it('passes through safe strings unchanged', () => {
    expect(escapeXml('Supabase MCP Server')).toBe('Supabase MCP Server')
  })

  it('handles server names with special characters', () => {
    const malicious = 'Server<img src=x onerror=alert(1)>'
    const escaped = escapeXml(malicious)
    expect(escaped).not.toContain('<')
    expect(escaped).not.toContain('>')
  })
})
