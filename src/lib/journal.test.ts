import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCalendarDay, shiftDay } from './journal.ts'

test('calendar days', () => {
  assert.ok(isCalendarDay('2026-11-12'))
  assert.ok(!isCalendarDay('2026-02-31'))
  assert.ok(!isCalendarDay('2026-1-1'))
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
})
