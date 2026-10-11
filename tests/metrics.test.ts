import { describe, it, expect } from 'vitest'
import { methodMetrics } from '../eval/metrics.js'

describe('methodMetrics', () => {
  it('divides precision by 10 and recall by all yes people', () => {
    const r = methodMetrics({ topNames: ['a', 'b', 'c', 'd'], yes: new Set(['a', 'b']), allYes: new Set(['a', 'b', 'x', 'y']) })
    expect(r).toEqual({ precisionAt10: 0.2, relativeRecall: 0.5, returned: 4 })
  })
  it('handles no yes people at all', () => {
    expect(methodMetrics({ topNames: [], yes: new Set(), allYes: new Set() })).toEqual({ precisionAt10: 0, relativeRecall: 0, returned: 0 })
  })
})
