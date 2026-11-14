import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mondayOf, WEEK_MATCH_MS, weekOfDay } from './week.ts'

test('every day of a week names its Monday', () => {
  for (const day of ['2026-11-02', '2026-11-04', '2026-11-08']) {
    assert.equal(weekOfDay(day).toISOString(), '2026-11-02T12:00:00.000Z')
  }
  assert.equal(weekOfDay('2026-11-09').toISOString(), '2026-11-09T12:00:00.000Z')
})

test('a week crosses a month and a year', () => {
  assert.equal(weekOfDay('2027-01-01').toISOString(), '2026-12-28T12:00:00.000Z')
})

test('the tool and every browser land on the same week, and never the next', () => {
  const tool = weekOfDay('2026-06-03').getTime()
  // Stored by a browser in UTC-3, as the live rows are, and at the far zones.
  for (const browser of ['2026-06-01T03:00:00Z', '2026-05-31T10:00:00Z', '2026-06-01T12:00:00Z']) {
    assert.ok(Math.abs(tool - Date.parse(browser)) <= WEEK_MATCH_MS, browser)
  }
  assert.ok(Math.abs(tool - Date.parse('2026-06-08T03:00:00Z')) > WEEK_MATCH_MS)
  assert.ok(Math.abs(tool - Date.parse('2026-05-25T03:00:00Z')) > WEEK_MATCH_MS)
})

test('a stored week names its Monday whichever clock wrote it', () => {
  // A browser in UTC-3 (the live rows), the far zones, and `weekOfDay`'s noon.
  for (const stored of ['2026-06-01T03:00:00Z', '2026-05-31T10:00:00Z', '2026-06-01T12:00:00Z']) {
    assert.equal(mondayOf(new Date(stored)), '2026-06-01', stored)
  }
  assert.equal(mondayOf(weekOfDay('2027-01-01')), '2026-12-28')
})
