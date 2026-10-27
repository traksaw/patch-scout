import { describe, it, expect } from 'vitest'
import { parseRounds } from '../eval/args.js'

describe('parseRounds', () => {
  it('defaults to 1 round, so a daily run costs one round', () => {
    expect(parseRounds([])).toBe(1)
  })
  it('reads --rounds N', () => {
    expect(parseRounds(['--rounds', '3'])).toBe(3)
  })
  it('ignores other arguments around it', () => {
    expect(parseRounds(['--verbose', '--rounds', '2', 'extra'])).toBe(2)
  })
  it('throws on a value that is not a whole number of at least 1', () => {
    expect(() => parseRounds(['--rounds', 'abc'])).toThrow()
    expect(() => parseRounds(['--rounds', '0'])).toThrow()
    expect(() => parseRounds(['--rounds', '1.5'])).toThrow()
    expect(() => parseRounds(['--rounds'])).toThrow() // the flag with no value
  })
})
