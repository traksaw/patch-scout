import { describe, it, expect } from 'vitest'
import { parsePeopleOutput } from '../src/parse.js'

const good = { name: 'Ana Ruiz', role: 'taught', url: 'https://a.example', philly: true }

describe('parsePeopleOutput', () => {
  it('accepts a valid object', () => {
    expect(parsePeopleOutput({ people: [good] })).toEqual({ people: [{ ...good, linkedUrls: [], quote: '' }], dropped: 0 })
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
  it('keeps a trimmed quote', () => {
    expect(parsePeopleOutput({ people: [{ ...good, quote: '  She led the workshop.  ' }] }).people[0]?.quote).toBe('She led the workshop.')
  })
  it('treats a missing or non-string quote as empty, not as a drop', () => {
    const out = parsePeopleOutput({ people: [good, { ...good, quote: 42 }] })
    expect(out.people.map((p) => p.quote)).toEqual(['', ''])
    expect(out.dropped).toBe(0)
  })
  it('drops organizations, teams, and events, and counts them', () => {
    const out = parsePeopleOutput({ people: [
      { ...good, entity: 'person' },
      { ...good, name: 'PhilaCon Valley', entity: 'organization' },
      { ...good, name: 'team Ben-Franklin', entity: 'team' },
      { ...good, name: 'PATCH 002', entity: 'event' },
    ] })
    expect(out.people.map((p) => p.name)).toEqual(['Ana Ruiz'])
    expect(out.dropped).toBe(3)
  })
  it('treats placeholder handles such as N/A as no handle, so merge cannot join strangers by them', () => {
    const out = parsePeopleOutput({ people: ['N/A', 'n/a', ' none ', 'Unknown', '-', 'null'].map((handle) => ({ ...good, handle })) })
    expect(out.people.map((p) => p.handle)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    expect(out.dropped).toBe(0)
  })
  it('drops items whose name is a placeholder or has no letters, and counts them', () => {
    const junk = ['null', 'N/A', ' None ', '/', '-', '123']
    const out = parsePeopleOutput({ people: [good, ...junk.map((name) => ({ ...good, name }))] })
    expect(out.people.map((p) => p.name)).toEqual(['Ana Ruiz'])
    expect(out.dropped).toBe(junk.length)
  })
  it('keeps short real names and names with accents', () => {
    const out = parsePeopleOutput({ people: ['Jo Li', 'Yōsuke Araki', "Ana O'Neil"].map((name) => ({ ...good, name })) })
    expect(out.people).toHaveLength(3)
  })
  it('drops org-like names and one-word names, since the model labels orgs as people', () => {
    const orgs = ['Philly SIGGRAPH Chapter', 'PhilaCon Valley', 'Philly Electronic Music Club', 'Iffy Books', 'philly', 'hardworkparty', 'Jacob']
    const out = parsePeopleOutput({ people: [good, ...orgs.map((name) => ({ ...good, name, entity: 'person' }))] })
    expect(out.people.map((p) => p.name)).toEqual(['Ana Ruiz'])
    expect(out.dropped).toBe(orgs.length)
  })
  it('keeps people whose surnames are also place or building words', () => {
    const names = ['Richard Green', 'Ana Hall', 'Bo Park', 'Cy Booker']
    expect(parsePeopleOutput({ people: names.map((name) => ({ ...good, name })) }).people).toHaveLength(names.length)
  })
  it('keeps a real handle', () => {
    expect(parsePeopleOutput({ people: [{ ...good, handle: ' anaruiz ' }] }).people[0]?.handle).toBe('anaruiz')
  })
  it('keeps an item with no entity field, as older fixtures have none', () => {
    expect(parsePeopleOutput({ people: [good] }).dropped).toBe(0)
  })
})
