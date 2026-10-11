export function methodMetrics(input: { topNames: string[]; yes: Set<string>; allYes: Set<string> }) {
  const found = input.topNames.filter((n) => input.yes.has(n)).length
  return {
    precisionAt10: found / 10,
    relativeRecall: input.allYes.size === 0 ? 0 : found / input.allYes.size,
    returned: input.topNames.length,
  }
}
