import { describe, it, expect } from 'vitest'
import { evidenceStrategy, EVIDENCE_QUERIES, OUTPUT_SCHEMA, SYSTEM_PROMPT } from '../src/strategies/evidence.js'
import fixture from './fixtures/strategy-b.json' with { type: 'json' }

const NOW = new Date('2026-10-01T00:00:00Z')

// One search result with its own structured summary, the shape Exa returns for contents.summary.
const page = (url: string, text: string, people: Record<string, unknown>[]) =>
  ({ url, title: 'Page', text, publishedDate: '2026-01-01', summary: JSON.stringify({ people }) })

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
    expect(candidates.length).toBeGreaterThan(0) // without this, an empty list passes the loop below
    for (const c of candidates) {
      expect(c.evidence.some((e) => e.philly)).toBe(true)
      expect(c.evidence.length).toBeGreaterThan(0)
    }
  })

  it('survives every query failing', async () => {
    const run = evidenceStrategy(async () => { throw new Error('down') }, NOW, { sleep: async () => {} })
    const { candidates, stats } = await run('t')
    expect(candidates).toEqual([])
    expect(stats.warnings).toHaveLength(4)
    expect(stats.warnings.at(-1)).toBe('No Philadelphia candidates found.')
  })

  it('asks Exa for one structured summary per page, plus the page text for the quote check', async () => {
    let seen: Record<string, unknown> = {}
    await evidenceStrategy(async (_q, opts) => { seen = opts; return { results: [] } }, NOW)('t')
    expect(seen.contents).toEqual({ text: true, summary: { query: SYSTEM_PROMPT, schema: OUTPUT_SCHEMA } })
    expect(seen.outputSchema).toBeUndefined() // no single answer for the whole search
    expect(seen.systemPrompt).toBeUndefined()
  })

  it('extracts people from every page on its own', async () => {
    const fake = { results: [
      page('https://one.example', 'Ana Ruiz led a beginner workshop on LED sewing.', [
        { name: 'Ana Ruiz', role: 'taught', url: 'https://one.example', philly: true, quote: 'Ana Ruiz led a beginner workshop on LED sewing' }]),
      page('https://two.example', 'Bo Chen built a sound-reactive light wall for the fair.', [
        { name: 'Bo Chen', role: 'built', url: 'https://two.example', philly: true, quote: 'Bo Chen built a sound-reactive light wall' }]),
    ] }
    const { candidates } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name).sort()).toEqual(['Ana Ruiz', 'Bo Chen'])
  })

  it('uses the page URL as the evidence link, even when the model cites another one', async () => {
    const fake = { results: [
      page('https://one.example', 'Ana Ruiz led a beginner workshop on LED sewing.', [
        { name: 'Ana Ruiz', role: 'taught', url: 'https://somewhere-else.example', philly: true, quote: 'Ana Ruiz led a beginner workshop on LED sewing' }]),
    ] }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates[0]?.evidence[0]?.url).toBe('https://one.example')
    expect(stats.dropped).toBe(0)
  })

  it('counts a page whose summary is not valid JSON as a drop, and keeps the other pages', async () => {
    const good = page('https://one.example', 'Ana Ruiz led a beginner workshop on LED sewing.', [
      { name: 'Ana Ruiz', role: 'taught', url: 'https://one.example', philly: true, quote: 'Ana Ruiz led a beginner workshop on LED sewing' }])
    const fake = { results: [good, { ...good, url: 'https://two.example', summary: 'not json' }] }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name)).toEqual(['Ana Ruiz'])
    expect(stats.dropped).toBe(3) // the bad page once per query x 3 queries
  })

  it('checks each role against its quote and uses the quote as the excerpt', async () => {
    const text = 'Last spring Ana Ruiz led a beginner workshop on LED sewing. Bo Chen builds knitted circuits in his lab.'
    const fake = { results: [page('https://page.example', text, [
      { name: 'Ana Ruiz', role: 'taught', url: 'https://page.example', philly: true, quote: 'Ana Ruiz led a beginner workshop on LED sewing' },
      { name: 'Bo Chen', role: 'taught', url: 'https://page.example', philly: true, quote: 'Bo Chen builds knitted circuits in his lab' },
    ])] }
    const { candidates } = await evidenceStrategy(async () => fake, NOW)('t')
    const kindOf = (name: string) => candidates.find((c) => c.name === name)?.evidence[0]?.kind
    expect(kindOf('Ana Ruiz')).toBe('taught')
    expect(kindOf('Bo Chen')).toBe('built')
    const ana = candidates.find((c) => c.name === 'Ana Ruiz')
    expect(ana?.evidence[0]?.excerpt).toBe('Ana Ruiz led a beginner workshop on LED sewing')
  })

  it('drops a person with no proof at all, and counts them', async () => {
    const text = 'Ana Ruiz led a beginner workshop on LED sewing at the library. Cy Diaz built a robot arm for the fair.'
    const fake = { results: [
      page('https://one.example', text, [
        // Cy has one invented quote here and a real one on the next page, so Cy has proof and stays.
        { name: 'Cy Diaz', role: 'built', url: 'https://one.example', philly: true, quote: 'Cy Diaz invented a new kind of tap card' },
        { name: 'Iffy Books', role: 'taught', url: 'https://one.example', philly: true, quote: '- Iffy Books' }]),
      page('https://two.example', text, [
        { name: 'Cy Diaz', role: 'built', url: 'https://two.example', philly: true, quote: 'Cy Diaz built a robot arm for the fair' },
        { name: 'Ghost', role: 'taught', url: 'https://two.example', philly: true, quote: 'Ghost taught a class on soldering every week' }]),
    ] }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name)).toEqual(['Cy Diaz'])
    expect(stats.dropped).toBe(2) // Iffy Books and Ghost: the check runs on merged people, so each counts once
  })
})
