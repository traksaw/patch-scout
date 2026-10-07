import { describe, it, expect } from 'vitest'
import { parsePeopleOutput } from '../src/parse.js'

const good = { name: 'Ana Ruiz', role: 'taught', url: 'https://a.example', philly: true }

describe('parsePeopleOutput', () => {
  it('accepts a valid object', () => {
    expect(parsePeopleOutput({ people: [good] })).toEqual({ people: [{ ...good, linkedUrls: [] }], dropped: 0 })
  })
  it('accepts the same object as a JSON string', () => {
    expect(parsePeopleOutput(JSON.stringify({ people: [good] })).people).toHaveLength(1)
  })
  it('drops items with a missing url, empty name, or bad role, and counts them', () => {
    const out = parsePeopleOutput({ people: [good, { ...good, url: '' }, { ...good, name: '  ' }, { ...good, role: 'spoke' }] })
    expect(out.people).toHaveLength(1)
    expect(out.dropped).toBe(3)
  })
  it('treats a non-boolean philly as false, not as a drop', () => {
    expect(parsePeopleOutput({ people: [{ ...good, philly: 'yes' }] }).people[0]?.philly).toBe(false)
  })
  it('returns nothing and drops 1 for garbage', () => {
    expect(parsePeopleOutput('not json')).toEqual({ people: [], dropped: 1 })
    expect(parsePeopleOutput({ nope: true })).toEqual({ people: [], dropped: 1 })
  })
  it('drops an item whose url is only spaces', () =>  {
    expect(parsePeopleOutput({ people: [{ ...good, url: '   ' }] })).toEqual({ people: [], dropped: 1 })
  })
})
