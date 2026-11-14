import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  contactSheet,
  framePositions,
  framesOf,
  monthTicks,
  nearestFrame,
  positionOf,
  weeksBetween,
  type HistoryWeek,
} from './over-time.ts'

const image = (id: string) => ({ id, fileName: `${id}.jpg`, fileType: 'image', url: `/api/files/${id}` })

const week = (
  day: string,
  attachments: HistoryWeek['attachments'],
  textContent: string | null = null,
): HistoryWeek => ({
  syncItemId: `si-${day}`,
  week: day,
  textContent,
  attachments,
})

const weeks = [
  week('2026-03-02', [image('a')], 'First one'),
  week('2026-03-09', [image('b'), { ...image('doc'), fileType: 'document' }, image('c')]),
  week('2026-03-16', [], 'Notes only'),
  week('2026-04-13', [image('d')]),
]

test('frames are the pictures, oldest first, numbered within their week', () => {
  const frames = framesOf(weeks)
  assert.deepEqual(
    frames.map((f) => [f.key, f.week, f.shot, f.shots]),
    [
      ['a', '2026-03-02', 1, 1],
      ['b', '2026-03-09', 1, 2],
      ['c', '2026-03-09', 2, 2],
      ['d', '2026-04-13', 1, 1],
    ],
  )
  assert.equal(frames[0]?.note, 'First one')
})

test('weeks are counted between Mondays, across a clock change and a year', () => {
  assert.equal(weeksBetween('2026-03-02', '2026-04-13'), 6)
  assert.equal(weeksBetween('2026-04-13', '2026-03-02'), -6)
  assert.equal(weeksBetween('2026-12-28', '2027-01-04'), 1)
})

test('a week sits on the timeline by its date, and one week alone sits in the middle', () => {
  assert.equal(positionOf('2026-03-02', '2026-03-02', '2026-04-13'), 0)
  assert.equal(positionOf('2026-04-13', '2026-03-02', '2026-04-13'), 1)
  assert.equal(positionOf('2026-03-23', '2026-03-02', '2026-04-13'), 0.5)
  assert.equal(positionOf('2026-03-02', '2026-03-02', '2026-03-02'), 0.5)
  assert.deepEqual(framePositions(framesOf(weeks)), [0, 1 / 6, 1 / 6, 1])
  assert.deepEqual(framePositions([]), [])
})

test('a point on the timeline picks the closest frame, the earlier of equals', () => {
  const positions = framePositions(framesOf(weeks))
  assert.equal(nearestFrame(positions, 0.05), 0)
  assert.equal(nearestFrame(positions, 0.2), 1)
  assert.equal(nearestFrame(positions, 0.9), 3)
  assert.equal(nearestFrame(positions, 2), 3)
})

test('month ticks are the months that start inside the span, thinned to the limit', () => {
  assert.deepEqual(
    monthTicks('2026-03-02', '2026-05-11').map((t) => t.day),
    ['2026-04-01', '2026-05-01'],
  )
  assert.deepEqual(monthTicks('2026-03-02', '2026-03-30'), [])
  const long = monthTicks('2025-01-06', '2026-12-28', 8)
  assert.equal(long.length, 8)
  assert.equal(long[0]?.day, '2025-02-01')
  assert.ok(long.every((t) => t.position > 0 && t.position < 1))
})

test('the contact sheet groups weeks by month and folds the missing ones into a gap', () => {
  const sheet = contactSheet(weeks)
  assert.deepEqual(
    sheet.map((m) => [m.month, m.entries.map((e) => (e.kind === 'week' ? e.week.week : `gap:${e.from}:${e.weeks}`))]),
    [
      ['2026-03', ['2026-03-02', '2026-03-09', '2026-03-16', 'gap:2026-03-23:3']],
      ['2026-04', ['2026-04-13']],
    ],
  )
  assert.deepEqual(contactSheet([]), [])
})
