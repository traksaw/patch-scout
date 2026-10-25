import { describe, it, expect } from 'vitest'
import { evidenceStrategy, EVIDENCE_QUERIES, EVIDENCE_SEARCHES, VENUE_DOMAINS, OUTPUT_SCHEMA } from '../src/strategies/evidence.js'
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

  it('runs each query twice: once on the open web and once on Philadelphia venue sites', () => {
    const searches = EVIDENCE_SEARCHES('voice agents')
    const queries = EVIDENCE_QUERIES('voice agents')
    expect(searches).toHaveLength(6)
    expect(searches.filter((s) => s.includeDomains === undefined).map((s) => s.query)).toEqual(queries)
    expect(searches.filter((s) => s.includeDomains === VENUE_DOMAINS).map((s) => s.query)).toEqual(queries)
  })

  it('lists venue sites as bare domains, without the organizer\'s own pages', () => {
    expect(VENUE_DOMAINS.length).toBeGreaterThan(0)
    for (const d of VENUE_DOMAINS) {
      expect(d).not.toMatch(/^https?:|\/|\s/) // 'temple.edu', not 'https://temple.edu/'
      expect(d).not.toMatch(/philacon/i)
    }
  })

  it('passes each search\'s includeDomains to Exa', async () => {
    const seen: Record<string, unknown>[] = []
    await evidenceStrategy(async (_q, opts) => { seen.push(opts); return { results: [] } }, NOW)('t')
    expect(seen.map((o) => o.includeDomains)).toEqual([undefined, undefined, undefined, VENUE_DOMAINS, VENUE_DOMAINS, VENUE_DOMAINS])
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
    expect(stats.calls).toHaveLength(6)
    expect(candidates.length).toBeGreaterThan(0) // without this, an empty list passes the loop below
    for (const c of candidates) {
      expect(c.evidence.some((e) => e.philly)).toBe(true)
      expect(c.evidence.length).toBeGreaterThan(0)
    }
  })

  it('drops a cited URL that is not in the results, and counts it', async () => {
    const fake = {
      results: [{ url: 'https://in.example', title: 'In', text: 'Kim Kept led a workshop on tap automations.', publishedDate: '2026-01-01' }],
      output: { content: { people: [
        { name: 'Kim Kept', role: 'taught', url: 'https://in.example', philly: true, quote: 'Kim Kept led a workshop on tap automations' },
        { name: 'Gil Ghost', role: 'taught', url: 'https://not-in-results.example', philly: true },
      ] } },
    }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name)).toEqual(['Kim Kept'])
    expect(stats.dropped).toBe(6) // Gil Ghost once per search x 6 searches
  })

  it('survives every query failing', async () => {
    const run = evidenceStrategy(async () => { throw new Error('down') }, NOW, { sleep: async () => {} })
    const { candidates, stats } = await run('t')
    expect(candidates).toEqual([])
    expect(stats.warnings).toHaveLength(7) // 6 failed searches + 'No Philadelphia candidates found.'
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
    const ana = candidates.find((c) => c.name === 'Ana Ruiz')
    expect(ana?.evidence[0]?.excerpt).toBe('Ana Ruiz led a beginner workshop on LED sewing')
  })

  it('drops a person with no proof at all, and counts them', async () => {
    const text = 'Ana Ruiz led a beginner workshop on LED sewing at the library. Cy Diaz built a robot arm for the fair.'
    const page = (url: string) => ({ url, title: 'Page', text, publishedDate: '2026-01-01' })
    const fake = {
      results: [page('https://one.example'), page('https://two.example')],
      output: { content: { people: [
        // Cy has one invented quote and one real one, so Cy has proof and stays.
        { name: 'Cy Diaz', role: 'built', url: 'https://one.example', philly: true, quote: 'Cy Diaz invented a new kind of tap card' },
        { name: 'Cy Diaz', role: 'built', url: 'https://two.example', philly: true, quote: 'Cy Diaz built a robot arm for the fair' },
        // Ivy Short has only a short quote, and Gus Ghost only an invented one: no proof anywhere.
        { name: 'Ivy Short', role: 'taught', url: 'https://one.example', philly: true, quote: '- Ivy Short' },
        { name: 'Gus Ghost', role: 'taught', url: 'https://two.example', philly: true, quote: 'Gus Ghost taught a class on soldering every week' },
      ] } },
    }
    const { candidates, stats } = await evidenceStrategy(async () => fake, NOW)('t')
    expect(candidates.map((c) => c.name)).toEqual(['Cy Diaz'])
    expect(stats.dropped).toBe(2) // Ivy Short and Gus Ghost: the check runs on merged people, so each counts once
  })
})
