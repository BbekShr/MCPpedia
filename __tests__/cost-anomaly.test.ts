import { describe, it, expect } from 'vitest'
import { evaluateMetric, evaluateRegenerationRatio, type DailyPoint } from '@/bots/lib/cost-anomaly'

const series = (values: number[]): DailyPoint[] =>
  values.map((value, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value }))

describe('evaluateMetric', () => {
  const rule = { name: 'm', floor: 1_000 }

  it('flags a last day above 2x the trailing average', () => {
    expect(evaluateMetric(series([5_000, 5_000, 5_000, 5_000, 11_000]), rule)).toHaveLength(1)
  })

  it('ignores steady usage', () => {
    expect(evaluateMetric(series([5_000, 5_200, 4_900, 5_100, 5_300]), rule)).toEqual([])
  })

  it('ignores spikes below the floor', () => {
    expect(evaluateMetric(series([100, 100, 100, 900]), rule)).toEqual([])
  })

  it('needs at least 3 baseline days before calling a spike', () => {
    expect(evaluateMetric(series([100, 50_000]), rule)).toEqual([])
  })

  it('flags a run-rate that would exceed the free allowance', () => {
    // Oct 2026 incident: ~240k R2 Class A writes/day against 1M/month included.
    const problems = evaluateMetric(
      series([200_000, 210_000, 230_000, 240_000, 240_000]),
      { name: 'r2', floor: 20_000, includedPerMonth: 1_000_000 },
    )
    expect(problems.some(p => p.includes('free allowance'))).toBe(true)
  })

  it('clears the projection once usage drops for a few days', () => {
    const problems = evaluateMetric(
      series([240_000, 240_000, 240_000, 3_000, 3_000, 3_000]),
      { name: 'r2', floor: 20_000, includedPerMonth: 1_000_000 },
    )
    expect(problems).toEqual([])
  })
})

describe('evaluateMetric alertPerMonth', () => {
  const r2 = { name: 'r2', floor: 20_000, includedPerMonth: 1_000_000, alertPerMonth: 2_000_000 }

  it('stays quiet on steady usage between the free allowance and the alert line', () => {
    // Nov 2026 steady state: ~40k/day projects to ~1.2M/month.
    expect(evaluateMetric(series([38_000, 41_000, 36_000, 40_000, 40_000, 40_000]), r2)).toEqual([])
  })

  it('flags a run-rate over the alert line and names both thresholds', () => {
    const problems = evaluateMetric(series([70_000, 70_000, 70_000, 70_000, 70_000]), r2)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('2,000,000/month alert line')
    expect(problems[0]).toContain('1,000,000 free allowance')
  })

  it('still catches the Oct 2026 regeneration loop', () => {
    expect(evaluateMetric(series([40_000, 40_000, 40_000, 40_000, 240_000]), r2).length).toBeGreaterThan(0)
  })
})

describe('evaluateRegenerationRatio', () => {
  it('flags more regenerations than requests', () => {
    expect(evaluateRegenerationRatio(306_000, 131_000, 5_000)).toHaveLength(1)
  })

  it('accepts regenerations below requests or below the floor', () => {
    expect(evaluateRegenerationRatio(3_000, 60_000, 5_000)).toEqual([])
    expect(evaluateRegenerationRatio(4_000, 100, 5_000)).toEqual([])
  })
})
