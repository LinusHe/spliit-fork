import { fromCalendarDate, toCalendarDate } from './date-only'

describe('calendar days are not instants', () => {
  test.each([
    [2026, 8, 18],
    [2026, 2, 29],
    [2026, 9, 25],
    [2028, 1, 29],
  ])(
    'preserves local date %i/%i/%i in storage and picker',
    (year, month, day) => {
      const local = new Date(year, month, day)
      const stored = fromCalendarDate(local)
      expect([
        stored.getUTCFullYear(),
        stored.getUTCMonth(),
        stored.getUTCDate(),
        stored.getUTCHours(),
      ]).toEqual([year, month, day, 0])
      const picked = toCalendarDate(stored)
      expect([
        picked.getFullYear(),
        picked.getMonth(),
        picked.getDate(),
        picked.getHours(),
      ]).toEqual([year, month, day, 0])
    },
  )
})
