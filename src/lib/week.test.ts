import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WEEK_MATCH_MS, weekDayOf, weekOfDay, weekStartOf } from './week.ts'

test('every day of a week names its Sunday', () => {
  for (const day of ['2026-11-22', '2026-11-23', '2026-11-26', '2026-11-28']) {
    assert.equal(weekOfDay(day).toISOString(), '2026-11-22T12:00:00.000Z', day)
  }
  // Saturday closes the week before; Sunday opens the next one.
  assert.equal(weekOfDay('2026-11-21').toISOString(), '2026-11-15T12:00:00.000Z')
  assert.equal(weekOfDay('2026-11-29').toISOString(), '2026-11-29T12:00:00.000Z')
})

test('a Thursday and the Sunday after it are two weeks', () => {
  assert.notEqual(weekOfDay('2026-11-19').getTime(), weekOfDay('2026-11-22').getTime())
})

test('a week crosses a month and a year', () => {
  assert.equal(weekOfDay('2027-01-01').toISOString(), '2026-12-27T12:00:00.000Z')
})

test('the browser week starts on Sunday at local midnight', () => {
  const sunday = weekStartOf(new Date(2026, 10, 22, 22, 42))
  assert.equal(sunday.getDay(), 0)
  assert.equal(sunday.getDate(), 22)
  assert.equal(sunday.getHours(), 0)
  assert.equal(weekStartOf(new Date(2026, 10, 21, 23, 59)).getDate(), 15)
})

test('the tool and every browser land on the same week, and never the next', () => {
  const tool = weekOfDay('2026-06-03').getTime()
  // Stored by a browser in UTC-5, as the live rows are, and at the far zones.
  for (const browser of ['2026-05-31T05:00:00Z', '2026-05-30T10:00:00Z', '2026-05-31T12:00:00Z']) {
    assert.ok(Math.abs(tool - Date.parse(browser)) <= WEEK_MATCH_MS, browser)
  }
  assert.ok(Math.abs(tool - Date.parse('2026-06-07T05:00:00Z')) > WEEK_MATCH_MS)
  assert.ok(Math.abs(tool - Date.parse('2026-05-24T05:00:00Z')) > WEEK_MATCH_MS)
})

test('a stored week names its Sunday whichever clock wrote it', () => {
  // A browser in UTC-5 (the live rows), the far zones, and `weekOfDay`'s noon.
  for (const stored of ['2026-05-31T05:00:00Z', '2026-05-30T10:00:00Z', '2026-05-31T12:00:00Z']) {
    assert.equal(weekDayOf(new Date(stored)), '2026-05-31', stored)
  }
  assert.equal(weekDayOf(weekOfDay('2027-01-01')), '2026-12-27')
})
