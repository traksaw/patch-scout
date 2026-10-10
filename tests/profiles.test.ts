import { describe, it, expect } from 'vitest'
import { profilesStrategy, nameFromTitle } from '../src/strategies/profiles.js'
import fixture from './fixtures/strategy-a.json' with { type: 'json' }

const NOW = new Date('2026-10-01T00:00:00Z')

describe('nameFromTitle', () => {
  it('takes the name before a separator', () => {
    expect(nameFromTitle('Ana Ruiz - Creative Technologist | LinkedIn')).toBe('Ana Ruiz')
    expect(nameFromTitle('Bo Chen | Portfolio')).toBe('Bo Chen')
    expect(nameFromTitle('Dee Fox – Maker')).toBe('Dee Fox')
    expect(nameFromTitle('Cy Diaz')).toBe('Cy Diaz')
  })
})

describe('profilesStrategy', () => {
  it('makes one call with category people and returns only Philly candidates', async () => {
    let seenQuery = ''
    let seen: Record<string, unknown> = {}
    const run = profilesStrategy(async (q, opts) => { seenQuery = q; seen = opts; return fixture }, NOW)
    const { candidates, stats } = await run('NFC and tap automations')
    expect(seen.category).toBe('people')
    expect(seenQuery).toContain('NFC and tap automations')
    expect(stats.calls).toHaveLength(1)
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) expect(c.evidence.every((e) => e.kind === 'profile')).toBe(true)
    expect(candidates.map((c) => c.name)).not.toContain('Person A05') // the one non-Philly result in the fixture
  })

  it('warns and returns no candidates when the search fails', async () => {
    const run = profilesStrategy(async () => { throw new Error('boom') }, NOW)
    const { candidates, stats } = await run('x')
    expect(candidates).toEqual([])
    expect(stats.warnings.some((w) => w.includes('boom'))).toBe(true)
  })
})
