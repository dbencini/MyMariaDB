import { describe, it, expect } from 'vitest'
import { formatDate } from '../../../src/renderer/src/utils/formatDate.js'

describe('formatDate', () => {
  it('formats ISO string as DD MMM YYYY', () => {
    expect(formatDate('2026-04-26T14:30:00.000Z')).toBe('26 Apr 2026')
  })

  it('formats first of January correctly', () => {
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('1 Jan 2026')
  })

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('')
  })
})
