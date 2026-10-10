import type { StrategyResult } from './types.js'

export function renderMarkdown(theme: string, strategy: 'a' | 'b', result: StrategyResult): string {
    const { candidates, stats } = result
    const cost = stats.calls.reduce((sum, call) => sum + call.costDollars, 0)
    const ms = stats.calls.reduce((sum, call) => sum + call.ms, 0)

    const lines = [
        `# patch-scout: ${theme}`,
        '',
        `Strategy ${strategy.toUpperCase()} · ${stats.calls.length} calls · $${cost.toFixed(4)} · ${(ms / 1000).toFixed(1)}s · Dropped: ${stats.dropped}`,
        '',
    ]
    if (!candidates.length) {
        lines.push('No Philadelphia candidates found.')
        return lines.join('\n')
    }

    candidates.forEach((c, i) => {
        lines.push(`${i + 1}. **${c.name}** · score ${c.score.toFixed(2)}`)
        for (const l of c.breakdown) {
            lines.push(`   - ${l.kind} · ${l.contribution.toFixed(2)} · ${l.url}`)
        }
    })

    return lines.join('\n')
}
