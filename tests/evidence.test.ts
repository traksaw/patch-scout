import { describe, it, expect } from 'vitest'
import { evidenceStrategy, EVIDENCE_QUERIES } from '../src/strategies/evidence.js'
import fixture from './fixtures/strategy-b.json' with { type: 'json' }

const NOW = new Date('2026-10-01T00:00:00Z')

describe('evidenceStrategy', () => {
  it('builds 3 queries with no keep/drop words', () => {
    const qs = EVIDENCE_QUERIES('NFC and tap automations')
    expect(qs).toHaveLength(3)
    for (const q of qs) expect(q).not.toMatch(/\b(only|include|exclude|drop|return)\b/i)
  })

  it('runs end to end on the recorded fixture', async () => {
    const run = evidenceStrategy(async () => fixture, NOW)
    const { candidates, stats } = await run('NFC and tap automations')
    expect(stats.calls).toHaveLength(3)
    for (const c of candidates) {
      expect(c.evidence.some((e) => e.philly)).toBe(true)
      expect(c.evidence.length).toBeGreaterThan(0)
    }
  })

  it('drops a cited URL that is not in the results, and counts it', async () => {
    const fake = {
      results: [{ url: 'https://in.example', title: 'In', highlights: ['x'], publishedDate: '2026-01-01' }],
      output: { content: { people: [
        { name: 'Kept', role: 'taught', url: 'https://in.example', philly: true },
        { name: 'Ghost', role: 'taught', url: 'https://not-in-results.example', philly: true },
      ] } },
    }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name)).toEqual(['Kept'])
    expect(stats.dropped).toBe(3) // Ghost once per query x 3 queries
  })

  it('survives every query failing', async () => {
    const run = evidenceStrategy(async () => { throw new Error('down') }, NOW, { sleep: async () => {} })
    const { candidates, stats } = await run('t')
    expect(candidates).toEqual([])
    expect(stats.warnings).toHaveLength(4)
    expect(stats.warnings.at(-1)).toBe('No Philadelphia candidates found.')
  })
})
