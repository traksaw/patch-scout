import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '../eval/links.js'

describe('normalizeUrl', () => {
  it('treats www and no-www as the same link', () => {
    expect(normalizeUrl('https://www.linkedin.com/in/ana')).toBe(normalizeUrl('https://linkedin.com/in/ana'))
  })
  it('treats http and https as the same link', () => {
    expect(normalizeUrl('http://temple.edu/events/1')).toBe(normalizeUrl('https://temple.edu/events/1'))
  })
  it('ignores a trailing slash', () => {
    expect(normalizeUrl('https://luma.com/abc/')).toBe(normalizeUrl('https://luma.com/abc'))
  })
  it('keeps different pages different', () => {
    expect(normalizeUrl('https://luma.com/abc')).not.toBe(normalizeUrl('https://luma.com/abd'))
  })
  it('keeps the case of the path, since some sites treat it as part of the address', () => {
    expect(normalizeUrl('https://example.org/Ana')).not.toBe(normalizeUrl('https://example.org/ana'))
  })
})
