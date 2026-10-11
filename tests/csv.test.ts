import { describe, it, expect } from 'vitest'
import { toCsv, parseCsv } from '../eval/csv.js'

describe('csv', () => {
  it('round-trips commas, quotes, and newlines', () => {
    const rows = [['a', 'b,c', 'say "hi"', 'line1\nline2']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})
