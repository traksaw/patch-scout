import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/render.js'

describe('renderMarkdown', () => {
  it('prints the no-candidates line plainly', () => {
    const md = renderMarkdown('t', 'b', { candidates: [], stats: { calls: [], dropped: 0, warnings: [] } })
    expect(md).toContain('No Philadelphia candidates found.')
  })
  it('prints rank, name, score, evidence links, dropped count, and cost', () => {
    const md = renderMarkdown('NFC', 'b', {
      candidates: [{ name: 'Ana Ruiz', handles: [], philly: true, score: 1.234, possibleDuplicateOf: [],
        breakdown: [{ url: 'https://a.example', kind: 'taught', kindWeight: 1, relevance: 1, recency: 1, strength: 1, multiplier: 1, contribution: 1 }],
        evidence: [{ url: 'https://a.example', title: 'NFC night', excerpt: 'Ana led...', kind: 'taught', philly: true, linkedUrls: [], relevance: 1 }] }],
      stats: { calls: [{ query: 'q', ok: true, attempts: 1, costDollars: 0.0123, ms: 900 }], dropped: 2, warnings: [] },
    })
    expect(md).toContain('1. **Ana Ruiz**')
    expect(md).toContain('1.23')
    expect(md).toContain('https://a.example')
    expect(md).toContain('Dropped: 2')
    expect(md).toContain('$0.0123')
  })
})
