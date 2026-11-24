import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayValue, healthDaysInputSchema, weekDays, weekSummary, type HealthDayData } from './health.ts'

const week = ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']

test('a day reads in the metric unit', () => {
  assert.equal(dayValue('sleep', { sleepMinutes: 450 }), 7.5)
  assert.equal(dayValue('steps', { steps: 8123 }), 8123)
  assert.equal(dayValue('workouts', { workouts: [{ type: 'running', minutes: 30 }] }), 1)
  assert.equal(dayValue('workouts', { workouts: [] }), null)
  assert.equal(dayValue('weight', {}), null)
  assert.equal(dayValue('weight', undefined), null)
})

test('a week averages, totals, counts or takes the last reading, over the days that have one', () => {
  const rows = new Map<string, HealthDayData>([
    [
      '2026-11-22',
      { sleepMinutes: 420, exerciseMinutes: 30, weightKg: 80.4, workouts: [{ type: 'running', minutes: 30 }] },
    ],
    ['2026-11-24', { sleepMinutes: 480, exerciseMinutes: 15, weightKg: 80.1 }],
    ['2026-11-30', { sleepMinutes: 60 }], // another week
  ])
  const sleep = weekSummary('sleep', week, rows)
  assert.equal(sleep.value, 7.5)
  assert.equal(sleep.days, 2)
  assert.equal(sleep.daily.length, 7)
  assert.equal(sleep.daily[1]?.value, null)
  assert.equal(weekSummary('exercise', week, rows).value, 45)
  assert.equal(weekSummary('weight', week, rows).value, 80.1)
  assert.equal(weekSummary('workouts', week, rows).value, 1)
  assert.equal(weekSummary('hrv', week, rows).value, null)
})

test('the phone payload is checked', () => {
  assert.ok(healthDaysInputSchema.safeParse({ days: [{ day: '2026-11-24', steps: 10 }] }).success)
  assert.ok(!healthDaysInputSchema.safeParse({ days: [] }).success)
  assert.ok(!healthDaysInputSchema.safeParse({ days: [{ day: '24/11/2026' }] }).success)
  assert.ok(!healthDaysInputSchema.safeParse({ days: [{ day: '2026-11-24', sleepMinutes: 5000 }] }).success)
})

test('a week is its Sunday and the six days after, across a month end', () => {
  assert.deepEqual(weekDays('2026-11-22'), week)
  assert.deepEqual(weekDays('2026-11-29'), [
    '2026-11-29',
    '2026-11-30',
    '2026-12-01',
    '2026-12-02',
    '2026-12-03',
    '2026-12-04',
    '2026-12-05',
  ])
})
