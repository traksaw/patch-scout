export function methodMetrics(input: { topNames: string[]; yes: Set<string>; allYes: Set<string> }) {
  const found = input.topNames.filter((n) => input.yes.has(n)).length
  return {
    precisionAt10: found / 10,
    relativeRecall: input.allYes.size === 0 ? 0 : found / input.allYes.size,
    returned: input.topNames.length,
  }
}

export function summarize(values: number[]): { mean: number; min: number; max: number } {
  if (values.length === 0) throw new Error('summarize needs at least one value: did a round fail?')
  const mean = values.reduce((a, c) => a + c, 0) / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)

  return { mean, max, min }
}

export function formatRange(s: { mean: number; min: number; max: number }, kind: 'percent' | 'number'): string {
    // decision 1: how to write ONE number, and which unit goes after it
    const fmt = (v: number) => (kind === 'percent' ? (v * 100).toFixed(0) : v.toFixed(1))
    const unit = kind === 'percent' ? '%' : ''

    // decision 2: range or no range
    if (s.min === s.max) return `${fmt(s.mean)}${unit}`
    return `${fmt(s.mean)}${unit} (${fmt(s.min)}–${fmt(s.max)}${unit})`
}
