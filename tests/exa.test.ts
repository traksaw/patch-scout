import { describe, it, expect } from 'vitest'
import { createSearcher, readCost } from '../src/exa.js'

const noSleep = async () => {}

describe('createSearcher', () => {
  it('returns data and records one ok call', async () => {
    const s = createSearcher(async () => ({ costDollars: { total: 0.01 }, results: [] }), { sleep: noSleep })
    const out = await s.search('q', {})
    expect(out.ok).toBe(true)
    expect(s.calls).toHaveLength(1)
    expect(s.calls[0]).toMatchObject({ query: 'q', ok: true, attempts: 1, costDollars: 0.01 })
  })

  it('retries twice, then reports failure without throwing', async () => {
    let n = 0
    const s = createSearcher(async () => { n++; throw new Error('boom') }, { sleep: noSleep })
    const out = await s.search('q', {})
    expect(out).toEqual({ ok: false, error: 'boom' })
    expect(n).toBe(3)
    expect(s.calls[0]).toMatchObject({ ok: false, attempts: 3, costDollars: 0 })
  })

  it('succeeds on a retry', async () => {
    let n = 0
    const s = createSearcher(async () => { n++; if (n < 2) throw new Error('flaky'); return { results: [] } }, { sleep: noSleep })
    const out = await s.search('q', {})
    expect(out.ok).toBe(true)
    expect(s.calls[0]?.attempts).toBe(2)
  })

  it('backs off with growing delays', async () => {
    const delays: number[] = []
    const s = createSearcher(async () => { throw new Error('x') }, { baseDelayMs: 100, sleep: async (ms) => { delays.push(ms) } })
    await s.search('q', {})
    expect(delays).toEqual([100, 200])
  })
})

describe('readCost', () => {
  it('reads a number', () => expect(readCost({ costDollars: 0.005 })).toBe(0.005))
  it('reads the object total Exa actually returns', () => expect(readCost({ costDollars: { total: 0.007, search: { neural: 0.007 } } })).toBe(0.007))
  it('returns 0 when absent or malformed', () => {
    expect(readCost({})).toBe(0)
    expect(readCost(null)).toBe(0)
    expect(readCost({ costDollars: 'free' })).toBe(0)
  })
})
