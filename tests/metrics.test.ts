import { describe, it, expect } from 'vitest'
import { methodMetrics, summarize, formatRange } from '../eval/metrics.js'

describe('methodMetrics', () => {
  it('divides precision by 10 and recall by all yes people', () => {
    const r = methodMetrics({ topNames: ['a', 'b', 'c', 'd'], yes: new Set(['a', 'b']), allYes: new Set(['a', 'b', 'x', 'y']) })
    expect(r).toEqual({ precisionAt10: 0.2, relativeRecall: 0.5, returned: 4, found: 2 })
  })
  it('handles no yes people at all', () => {
    expect(methodMetrics({ topNames: [], yes: new Set(), allYes: new Set() })).toEqual({ precisionAt10: 0, relativeRecall: 0, returned: 0, found: 0 })
  })
})

describe('summarize', () => {
  it('gives the mean, the lowest, and the highest reading', () => {
    const s = summarize([0.5, 0.57, 0.64])
    expect(s.mean).toBeCloseTo(0.57) // decimal math is not exact: (0.5 + 0.57 + 0.64) / 3 is 0.5700000000000001
    expect([s.min, s.max]).toEqual([0.5, 0.64])
  })
  it('does not care about the order of the readings', () => {
    const s = summarize([0.45, 0.3, 0.33])
    expect(s.mean).toBeCloseTo(0.36)
    expect([s.min, s.max]).toEqual([0.3, 0.45])
  })
  it('handles a single reading', () => {
    expect(summarize([0.4])).toEqual({ mean: 0.4, min: 0.4, max: 0.4 })
  })
  it('throws on an empty list, since no readings means the run failed', () => {
    expect(() => summarize([])).toThrow()
  })
})

describe('formatRange', () => {
  it('prints a share as a percent with its range', () => {
    expect(formatRange({ mean: 0.57, min: 0.5, max: 0.64 }, 'percent')).toBe('57% (50–64%)')
  })
  it('prints a plain number with one decimal', () => {
    expect(formatRange({ mean: 6.7, min: 5, max: 8.2 }, 'number')).toBe('6.7 (5.0–8.2)')
  })
  it('prints only the mean when every reading is the same', () => {
    expect(formatRange({ mean: 0.4, min: 0.4, max: 0.4 }, 'percent')).toBe('40%')
  })
})
