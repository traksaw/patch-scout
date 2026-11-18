import { describe, it, expect } from 'vitest'
import { localDate, unfinishedRows } from '../eval/save.js'

describe('localDate', () => {
  it('formats the local calendar date as YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 10, 17, 9, 0))).toBe('2026-11-17') // months count from 0: 10 is November
  })
  it('uses the local date late in the evening, not the UTC date', () => {
    // 11:30 PM local time is already the next day in UTC for anyone west of London.
    expect(localDate(new Date(2026, 10, 17, 23, 30))).toBe('2026-11-17')
  })
  it('pads single-digit months and days', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('unfinishedRows', () => {
  const header = ['theme', 'id', 'name', 'evidence', 'label']
  it('returns nothing when every label is yes or no', () => {
    expect(unfinishedRows([header, ['t', '1', 'Ana Ruiz', 'u', ' yes'], ['t', '2', 'Bo Chen', 'u', 'no']])).toEqual([])
  })
  it('lists rows that are blank or not exactly yes or no', () => {
    const rows = [header, ['t', '1', 'Ana Ruiz', 'u', ' '], ['t', '2', 'Bo Chen', 'u', ' yesx'], ['t', '3', 'Cy Diaz', 'u', '?']]
    expect(unfinishedRows(rows)).toEqual(['Ana Ruiz', 'Bo Chen', 'Cy Diaz'])
  })
})
