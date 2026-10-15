import { describe, it, expect } from 'vitest'
import { mergeMentions, nameKey } from '../src/merge.js'
import type { Evidence, Mention } from '../src/types.js'

function ev(url: string, over: Partial<Evidence> = {}): Evidence {
  return { url, title: url, excerpt: '', kind: 'built', philly: true, linkedUrls: [], relevance: 1, ...over }
}
function m(name: string, url: string, over: Partial<Evidence> = {}, handle?: string): Mention {
  return { name, handle, evidence: ev(url, over) }
}

describe('mergeMentions', () => {
  it('returns [] for no mentions', () => {
    expect(mergeMentions([])).toEqual([])
  })

  it('merges when one page links to the other (rule 1)', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://talk.example/nfc', { linkedUrls: ['https://ana.dev'] }),
      m('A. Ruiz', 'https://ana.dev'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('Ana Ruiz')
    expect(out[0]?.evidence.map((e) => e.url)).toEqual(['https://talk.example/nfc', 'https://ana.dev'])
  })

  it('merges on a shared handle, ignoring case (rule 1)', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://a.example', {}, 'AnaRuiz'),
      m('Ana R.', 'https://b.example', { philly: false }, 'anaruiz'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.handles).toEqual(['anaruiz'])
    expect(out[0]?.philly).toBe(true)
  })

  it('merges an exact name match when both are Philly (rule 2), ignoring case and spacing', () => {
    const out = mergeMentions([
      m('Ana  Ruiz', 'https://a.example'),
      m('ana ruiz', 'https://b.example'),
    ])
    expect(out).toHaveLength(1)
  })

  it('does not merge the same name when one is not Philly, and flags both', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://a.example', { philly: true }),
      m('Ana Ruiz', 'https://b.example', { philly: false }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]?.possibleDuplicateOf).toEqual(['Ana Ruiz'])
    expect(out[1]?.possibleDuplicateOf).toEqual(['Ana Ruiz'])
  })

  it('keeps nickname variants separate', () => {
    const out = mergeMentions([m('Jen Smith', 'https://a.example'), m('Jennifer Smith', 'https://b.example')])
    expect(out).toHaveLength(2)
    expect(out[0]?.possibleDuplicateOf).toEqual([])
  })

  it('merges transitively: A links B, B shares a handle with C', () => {
    const out = mergeMentions([
      m('Ana Ruiz', 'https://a.example', { linkedUrls: ['https://b.example'] }),
      m('Ana Ruiz', 'https://b.example', {}, 'anaruiz'),
      m('A. R.', 'https://c.example', { philly: false }, 'anaruiz'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.evidence).toHaveLength(3)
  })

  it('removes duplicate evidence URLs inside a merged person', () => {
    const out = mergeMentions([m('Ana Ruiz', 'https://a.example'), m('Ana Ruiz', 'https://a.example')])
    expect(out[0]?.evidence).toHaveLength(1)
  })

  it('keeps unrelated people separate, in input order', () => {
    const out = mergeMentions([m('Ana Ruiz', 'https://a.example'), m('Bo Chen', 'https://b.example')])
    expect(out.map((p) => p.name)).toEqual(['Ana Ruiz', 'Bo Chen'])
  })

  it('merges name variants that differ only by text in parentheses', () => {
    const out = mergeMentions([m('Tony (Yun Sing) Siu', 'https://a.example'), m('Tony Siu', 'https://b.example')])
    expect(out).toHaveLength(1)
  })

  it('merges a name with a middle initial and the same name without one', () => {
    const out = mergeMentions([m('Waskar M. Paulino', 'https://a.example'), m('Waskar Paulino', 'https://b.example')])
    expect(out).toHaveLength(1)
  })

  it('does not merge two different middle initials, and flags both', () => {
    const out = mergeMentions([m('John A. Smith', 'https://a.example'), m('John B. Smith', 'https://b.example')])
    expect(out).toHaveLength(2)
    expect(out[0]?.possibleDuplicateOf).toEqual(['John B. Smith'])
    expect(out[1]?.possibleDuplicateOf).toEqual(['John A. Smith'])
  })

  it('flags a first name with a last initial against the full name, without merging', () => {
    const out = mergeMentions([m('Tony S.', 'https://a.example'), m('Tony Siu', 'https://b.example')])
    expect(out).toHaveLength(2)
    expect(out[0]?.possibleDuplicateOf).toEqual(['Tony Siu'])
    expect(out[1]?.possibleDuplicateOf).toEqual(['Tony S.'])
  })

  it('does not flag a short form whose initial does not match', () => {
    const out = mergeMentions([m('Tony B.', 'https://a.example'), m('Tony Siu', 'https://b.example')])
    expect(out[0]?.possibleDuplicateOf).toEqual([])
  })
})

describe('nameKey', () => {
  it('lowercases, drops text in parentheses and single-letter initials, and collapses spaces', () => {
    expect(nameKey('Tony (Yun Sing) Siu')).toBe('tony siu')
    expect(nameKey('Waskar M. Paulino')).toBe('waskar paulino')
    expect(nameKey('  Ana   Ruiz ')).toBe('ana ruiz')
  })

  it('keeps apostrophes, hyphens, and accents', () => {
    expect(nameKey("Ana O'Neil")).toBe("ana o'neil")
    expect(nameKey('Diego Mendoza-Ramos')).toBe('diego mendoza-ramos')
    expect(nameKey('Yōsuke Araki')).toBe('yōsuke araki')
  })
})
