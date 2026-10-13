import { describe, it, expect } from 'vitest'
import { checkRole } from '../src/role.js'

const PAGE = 'Join us Saturday. Ana Ruiz led a beginner workshop on LED sewing at the library. ' +
  'She also develops knitted electronic components into garments in her lab.'

describe('checkRole', () => {
  it('keeps taught when the quote is on the page and has a teaching word', () => {
    expect(checkRole('taught', 'Ana Ruiz led a beginner workshop on LED sewing', PAGE)).toBe('taught')
  })

  it('lowers taught to built when the quote is real but shows no teaching', () => {
    expect(checkRole('taught', 'develops knitted electronic components into garments', PAGE)).toBe('built')
  })

  it('lowers any role to profile when the quote is not on the page', () => {
    expect(checkRole('taught', 'Ana Ruiz taught a soldering class every week', PAGE)).toBe('profile')
    expect(checkRole('built', 'Ana Ruiz built a robot arm from scratch', PAGE)).toBe('profile')
  })

  it('keeps built and wrote without a teaching word, when the quote is real', () => {
    expect(checkRole('built', 'develops knitted electronic components into garments', PAGE)).toBe('built')
    expect(checkRole('wrote', 'develops knitted electronic components into garments', PAGE)).toBe('wrote')
  })

  it('ignores case and extra spaces when it looks for the quote', () => {
    expect(checkRole('taught', '  ana RUIZ led a   beginner\nworkshop on LED sewing ', PAGE)).toBe('taught')
  })

  it('treats a quote under 20 characters as no proof', () => {
    expect(checkRole('taught', 'led a workshop', PAGE)).toBe('profile')
    expect(checkRole('built', '', PAGE)).toBe('profile')
  })

  it('matches teaching words as whole words only', () => {
    // "classic" contains "class", and "misled" contains "led". Neither is teaching.
    const page = 'Her classic knitted garments misled nobody about the craft involved.'
    expect(checkRole('taught', 'Her classic knitted garments misled nobody', page)).toBe('built')
  })
})
