import { describe, it, expect } from 'vitest'
import { evidenceStrategy, EVIDENCE_QUERIES, OUTPUT_SCHEMA } from '../src/strategies/evidence.js'
import fixture from './fixtures/strategy-b.json' with { type: 'json' }

const NOW = new Date('2026-10-01T00:00:00Z')

describe('evidenceStrategy', () => {
  it('builds 3 queries with no keep/drop words', () => {
    const qs = EVIDENCE_QUERIES('NFC and tap automations')
    expect(qs).toHaveLength(3)
    for (const q of qs) expect(q).not.toMatch(/\b(only|include|exclude|drop|return)\b/i)
  })

  it('searches for local events, not repos or blogs, since those pages rarely name a city', () => {
    const qs = EVIDENCE_QUERIES('voice agents')
    for (const q of qs) {
      expect(q).toContain('voice agents')
      expect(q).toMatch(/Philadelphia/)
      expect(q).not.toMatch(/\b(open source|project|developer|blog|tutorial)\b/i)
    }
    expect(new Set(qs).size).toBe(3) // three different queries, not one repeated
  })

  it('makes the model say whether each item is a person, a team, an organization, or an event', () => {
    const item = OUTPUT_SCHEMA.properties.people.items
    expect(item.properties.entity.type).toBe('string')
    expect([...item.properties.entity.enum].sort()).toEqual(['event', 'organization', 'person', 'team'])
    expect(item.required).toContain('entity')
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

  it('asks Exa for page text, not highlights, so the quote can be checked', async () => {
    let seen: Record<string, unknown> = {}
    await evidenceStrategy(async (_q, opts) => { seen = opts; return { results: [] } }, NOW)('t')
    expect(seen.contents).toEqual({ text: true })
  })

  it('checks each role against its quote and uses the quote as the excerpt', async () => {
    const text = 'Last spring Ana Ruiz led a beginner workshop on LED sewing. Bo Chen builds knitted circuits in his lab.'
    const fake = {
      results: [{ url: 'https://page.example', title: 'Page', text, publishedDate: '2026-01-01' }],
      output: { content: { people: [
        { name: 'Ana Ruiz', role: 'taught', url: 'https://page.example', philly: true, quote: 'Ana Ruiz led a beginner workshop on LED sewing' },
        { name: 'Bo Chen', role: 'taught', url: 'https://page.example', philly: true, quote: 'Bo Chen builds knitted circuits in his lab' },
        { name: 'Cy Diaz', role: 'taught', url: 'https://page.example', philly: true, quote: 'Cy Diaz taught a class on soldering' },
      ] } },
    }
    const { candidates } = await evidenceStrategy(async () => fake, NOW)('t')
    const kindOf = (name: string) => candidates.find((c) => c.name === name)?.evidence[0]?.kind
    expect(kindOf('Ana Ruiz')).toBe('taught')
    expect(kindOf('Bo Chen')).toBe('built')
    expect(kindOf('Cy Diaz')).toBe('profile')
    const ana = candidates.find((c) => c.name === 'Ana Ruiz')
    expect(ana?.evidence[0]?.excerpt).toBe('Ana Ruiz led a beginner workshop on LED sewing')
    const cy = candidates.find((c) => c.name === 'Cy Diaz')
    expect(cy?.evidence[0]?.excerpt).toBe('') // an invented quote is never shown as proof
  })
})
