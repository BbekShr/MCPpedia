import { describe, it, expect } from 'vitest'
import { measureTokenEfficiency, scoreCompatibility, scoreMaintenance } from '@/lib/scoring'
import type { Tool } from '@/lib/types'

describe('measureTokenEfficiency', () => {
  it('returns grade F and score 0 for no tools', () => {
    const result = measureTokenEfficiency([])
    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
    expect(result.total_tool_tokens).toBe(0)
  })

  it('returns grade A for a small tool', () => {
    const tools: Tool[] = [
      { name: 'hello', description: 'Says hello', input_schema: {} },
    ]
    const result = measureTokenEfficiency(tools)
    expect(result.score).toBe(20)
    expect(result.grade).toBe('A')
    expect(result.total_tool_tokens).toBeGreaterThan(0)
    expect(result.total_tool_tokens).toBeLessThanOrEqual(500)
  })

  it('returns lower grade for many large tools', () => {
    const tools: Tool[] = Array.from({ length: 50 }, (_, i) => ({
      name: `tool_${i}`,
      description: 'A '.repeat(200),
      input_schema: {
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 10 }, (_, j) => [`param_${j}`, { type: 'string', description: 'A param' }])
        ),
      },
    }))
    const result = measureTokenEfficiency(tools)
    expect(result.total_tool_tokens).toBeGreaterThan(8000)
    expect(result.grade).toBe('F')
    expect(result.score).toBe(2)
  })

  it('sorts tool_breakdown by tokens descending', () => {
    const tools: Tool[] = [
      { name: 'small', description: 'x', input_schema: {} },
      { name: 'large', description: 'x'.repeat(500), input_schema: { type: 'object', properties: { a: { type: 'string' } } } },
    ]
    const result = measureTokenEfficiency(tools)
    expect(result.tool_breakdown[0].name).toBe('large')
    expect(result.tool_breakdown[1].name).toBe('small')
  })
})

describe('scoreCompatibility', () => {
  it('returns 0 for no transport and no tools', () => {
    const result = scoreCompatibility([], [], [])
    expect(result.score).toBe(0)
  })

  it('gives points for stdio transport', () => {
    const result = scoreCompatibility(['stdio'], [], [])
    expect(result.score).toBeGreaterThan(0)
  })

  it('gives more points for multiple transports', () => {
    const single = scoreCompatibility(['stdio'], [], [])
    const multi = scoreCompatibility(['stdio', 'sse'], [], [])
    expect(multi.score).toBeGreaterThan(single.score)
  })

  it('gives points for compatible clients', () => {
    const noClients = scoreCompatibility(['stdio'], [], [{ name: 'test', description: 'test' }])
    const withClients = scoreCompatibility(['stdio'], ['claude-desktop', 'cursor'], [{ name: 'test', description: 'test' }])
    expect(withClients.score).toBeGreaterThan(noClients.score)
  })
})

describe('scoreMaintenance', () => {
  it('gives high score for recently committed repo with stars', () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
    const result = scoreMaintenance(recent, 1000, 500, 10, false, true)
    expect(result.score).toBeGreaterThanOrEqual(20)
  })

  it('gives low score for old abandoned repo', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString() // 400 days ago
    const result = scoreMaintenance(old, 0, 0, 0, false, false)
    expect(result.score).toBeLessThanOrEqual(5)
  })

  it('penalizes archived repos', () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const active = scoreMaintenance(recent, 100, 100, 5, false, false)
    const archived = scoreMaintenance(recent, 100, 100, 5, true, false)
    expect(archived.score).toBeLessThan(active.score)
  })

  it('handles null last_commit gracefully', () => {
    const result = scoreMaintenance(null, 0, 0, 0, false, false)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})
