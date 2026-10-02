import { describe, it, expect } from 'vitest'
import { recencyFactor, itemStrength, rankPeople, KIND_WEIGHTS } from '../src/rank.js'
import type { Evidence, MergedPerson } from '../src/types.js'

const NOW = new Date('2026-10-01T00:00:00Z')

let seq = 0
function ev(over: Partial<Evidence> = {}): Evidence {
  seq++
  return { url: `https://x.example/${seq}`, title: 't', excerpt: '', kind: 'taught', philly: true, linkedUrls: [], relevance: 1, publishedDate: '2026-10-01', ...over }
}
function person(name: string, evidence: Evidence[]): MergedPerson {
  return { name, handles: [], philly: evidence.some((e) => e.philly), evidence, possibleDuplicateOf: [] }
}

describe('recencyFactor', () => {
  it('is 1 for today', () => expect(recencyFactor('2026-10-01', NOW)).toBeCloseTo(1, 3))
  it('halves every 2 years', () => expect(recencyFactor('2024-10-01', NOW)).toBeCloseTo(0.5, 2))
  it('is 0.5 when undated or unparseable', () => {
    expect(recencyFactor(undefined, NOW)).toBe(0.5)
    expect(recencyFactor('not a date', NOW)).toBe(0.5)
  })
  it('is 1 for a future date', () => expect(recencyFactor('2027-01-01', NOW)).toBe(1))
})

describe('itemStrength', () => {
  it('orders kinds taught > built > wrote > profile', () => {
    const s = (['taught', 'built', 'wrote', 'profile'] as const).map((kind) => itemStrength(ev({ kind }), NOW))
    expect(s).toEqual([...s].sort((a, b) => b - a))
    expect(s[0]).toBeCloseTo(KIND_WEIGHTS.taught, 3)
  })
  it('multiplies kind, relevance, and recency', () => {
    expect(itemStrength(ev({ kind: 'built', relevance: 0.5, publishedDate: '2024-10-01' }), NOW)).toBeCloseTo(0.7 * 0.5 * 0.5, 2)
  })
})

describe('rankPeople', () => {
  it('drops a strong person with no Philly evidence', () => {
    const out = rankPeople([person('Remote Star', [ev({ philly: false })]), person('Local', [ev({ kind: 'wrote' })])], { now: NOW })
    expect(out.map((c) => c.name)).toEqual(['Local'])
  })

  it('keeps a person when only one of their items is Philly', () => {
    const out = rankPeople([person('Mixed', [ev({ philly: false }), ev({ philly: true, kind: 'profile' })])], { now: NOW })
    expect(out).toHaveLength(1)
  })

  it('applies diminishing returns: ten weak items do not beat one strong taught item', () => {
    const weak = Array.from({ length: 10 }, () => ev({ kind: 'wrote', relevance: 0.3, publishedDate: undefined }))
    const out = rankPeople([person('Many Weak', weak), person('One Strong', [ev()])], { now: NOW })
    expect(out[0]?.name).toBe('One Strong')
  })

  it('weights items 1, 1/2, 1/4 in strength order, and the breakdown sums to the score', () => {
    const out = rankPeople([person('A', [ev({ kind: 'wrote' }), ev({ kind: 'taught' }), ev({ kind: 'built' })])], { now: NOW })
    const c = out[0]!
    expect(c.breakdown.map((l) => l.multiplier)).toEqual([1, 0.5, 0.25])
    expect(c.breakdown.map((l) => l.kind)).toEqual(['taught', 'built', 'wrote'])
    expect(c.score).toBeCloseTo(1 + 0.7 / 2 + 0.5 / 4, 3)
    expect(c.breakdown.reduce((s, l) => s + l.contribution, 0)).toBeCloseTo(c.score, 6)
  })

  it('copies the duplicate flag onto the candidate', () => {
    const p = { ...person('Ana Ruiz', [ev()]), possibleDuplicateOf: ['Ana Ruiz'] }
    expect(rankPeople([p], { now: NOW })[0]?.possibleDuplicateOf).toEqual(['Ana Ruiz'])
  })

  it('sorts by score, breaks ties by name, and caps at the limit', () => {
    const people = ['Cy', 'Al', 'Bo'].map((n) => person(n, [ev()]))
    expect(rankPeople(people, { now: NOW }).map((c) => c.name)).toEqual(['Al', 'Bo', 'Cy'])
    expect(rankPeople(people, { now: NOW, limit: 2 })).toHaveLength(2)
  })

  it('returns [] when nobody passes the gate', () => {
    expect(rankPeople([person('X', [ev({ philly: false })])], { now: NOW })).toEqual([])
  })
})
