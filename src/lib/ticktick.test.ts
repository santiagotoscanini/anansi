import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  composeTitle,
  dayInZone,
  dueFields,
  dueForSection,
  leadingEmoji,
  mergeFields,
  midnightInZone,
  parseTickTickDate,
  remoteDueDay,
  sectionOf,
  stripEmoji,
  taskDay,
  toTickTickDate,
} from './ticktick.ts'

test('a day starts at its own midnight in the zone', () => {
  assert.equal(midnightInZone('2026-11-23', 'America/Montevideo').toISOString(), '2026-11-23T03:00:00.000Z')
  assert.equal(midnightInZone('2026-11-23', 'UTC').toISOString(), '2026-11-23T00:00:00.000Z')
  assert.equal(midnightInZone('2026-11-23', 'Asia/Tokyo').toISOString(), '2026-11-22T15:00:00.000Z')
})

test('midnight holds across a DST change', () => {
  // New York: EDT (-4) until 2026-11-01, EST (-5) after.
  assert.equal(midnightInZone('2026-10-31', 'America/New_York').toISOString(), '2026-10-31T04:00:00.000Z')
  assert.equal(midnightInZone('2026-11-02', 'America/New_York').toISOString(), '2026-11-02T05:00:00.000Z')
})

test('a day goes to TickTick and comes back the same day', () => {
  for (const zone of ['America/Montevideo', 'Asia/Tokyo', 'UTC', 'America/New_York']) {
    const fields = dueFields('2026-03-08', zone)
    assert.equal(remoteDueDay(fields, zone), '2026-03-08', zone)
    // Read back by a user whose zone moved, an all-day date stays its day.
    assert.equal(remoteDueDay(fields, 'Pacific/Kiritimati'), '2026-03-08', zone)
  }
  assert.deepEqual(dueFields(null, 'UTC'), { dueDate: null, startDate: null, isAllDay: false })
})

test('TickTick dates parse with or without milliseconds', () => {
  assert.equal(parseTickTickDate('2019-11-13T03:00:00+0000')?.toISOString(), '2019-11-13T03:00:00.000Z')
  assert.equal(parseTickTickDate('2026-03-05T00:00:00.000+0000')?.toISOString(), '2026-03-05T00:00:00.000Z')
  assert.equal(parseTickTickDate('2026-03-05T00:00:00.000-0300')?.toISOString(), '2026-03-05T03:00:00.000Z')
  assert.equal(parseTickTickDate(''), null)
  assert.equal(parseTickTickDate('nonsense'), null)
  assert.equal(toTickTickDate(new Date('2026-11-23T03:00:00Z')), '2026-11-23T03:00:00+0000')
})

test('a timed TickTick date is read in the user zone', () => {
  const task = { dueDate: '2026-11-24T01:00:00+0000', isAllDay: false, timeZone: 'UTC' }
  assert.equal(remoteDueDay(task, 'America/Montevideo'), '2026-11-23')
  assert.equal(dayInZone(new Date('2026-11-24T01:00:00Z'), 'UTC'), '2026-11-24')
})

test('a field changed on one side takes that side', () => {
  const base = { title: 'a', content: 'x' }
  const remoteEdit = mergeFields({ title: 'a', content: 'x' }, { title: 'b', content: 'x' }, base)
  assert.deepEqual(remoteEdit, { agreed: { title: 'b', content: 'x' }, push: {}, pull: { title: 'b' } })

  const localEdit = mergeFields({ title: 'c', content: 'x' }, { title: 'a', content: 'x' }, base)
  assert.deepEqual(localEdit, { agreed: { title: 'c', content: 'x' }, push: { title: 'c' }, pull: {} })

  const both = mergeFields({ title: 'c', content: 'x' }, { title: 'a', content: 'y' }, base)
  assert.deepEqual(both, { agreed: { title: 'c', content: 'y' }, push: { title: 'c' }, pull: { content: 'y' } })
})

test('a field changed on both sides keeps Anansi, and agreeing needs nothing', () => {
  const base = { title: 'a', done: false }
  assert.deepEqual(mergeFields({ title: 'l', done: true }, { title: 'r', done: true }, base), {
    agreed: { title: 'l', done: true },
    push: { title: 'l' },
    pull: {},
  })
})

test('a field the snapshot never saw is pushed, not pulled', () => {
  assert.deepEqual(mergeFields({ due: '2026-01-01' }, { due: null }, {}), {
    agreed: { due: '2026-01-01' },
    push: { due: '2026-01-01' },
    pull: {},
  })
})

test('a due day puts a task in the section Horizons would', () => {
  const today = '2026-11-23'
  assert.equal(sectionOf(null, today), 'backlog')
  assert.equal(sectionOf('2026-11-06', today), 'past')
  assert.equal(sectionOf('2026-11-23', today), 'month')
  assert.equal(sectionOf('2026-11-30', today), 'month')
  assert.equal(sectionOf('2026-12-31', today), 'quarter')
  assert.equal(sectionOf('2027-01-01', today), 'later')
  assert.equal(sectionOf('2026-08-01', '2026-05-10'), 'year')
})

test('a task moved into a section gets the end of that period', () => {
  const today = '2026-11-23'
  assert.equal(dueForSection('backlog', today), null)
  assert.equal(dueForSection('month', today), '2026-11-30')
  assert.equal(dueForSection('quarter', today), '2026-12-31')
  assert.equal(dueForSection('year', today), '2026-12-31')
  assert.equal(dueForSection('month', '2028-02-10'), '2028-02-29')
  assert.equal(dueForSection('quarter', '2026-04-01'), '2026-06-30')
  assert.equal(dueForSection('past', today), undefined)
  assert.equal(dueForSection('later', today), undefined)
  // The day each one gives lands back in that section.
  assert.equal(sectionOf(dueForSection('month', today) ?? null, today), 'month')
  assert.equal(sectionOf(dueForSection('quarter', '2026-04-01') ?? null, '2026-04-01'), 'quarter')
})

test('a title carries its emoji, and loses it again', () => {
  assert.equal(composeTitle('🌉', 'Mudarme'), '🌉 Mudarme')
  assert.equal(composeTitle(null, 'Mudarme'), 'Mudarme')
  for (const emoji of ['🌉', '🕸️', '🏋🏻', '👨‍👩‍👧', '🇺🇾', '❤️']) {
    assert.equal(stripEmoji(composeTitle(emoji, 'Hacer algo')), 'Hacer algo', emoji)
    assert.equal(leadingEmoji(composeTitle(emoji, 'Hacer algo')), emoji, emoji)
  }
  assert.equal(stripEmoji('Plain title'), 'Plain title')
  assert.equal(leadingEmoji('Plain title'), null)
  assert.equal(stripEmoji('2 ofertas'), '2 ofertas')
})

test('a date-only Anansi date is its own day in any zone', () => {
  assert.equal(taskDay(new Date('2026-11-06T00:00:00Z'), 'America/Los_Angeles'), '2026-11-06')
  assert.equal(taskDay(new Date('2026-11-06T17:00:00Z'), 'America/Los_Angeles'), '2026-11-06')
  assert.equal(taskDay(new Date('2026-11-07T07:59:59Z'), 'America/Los_Angeles'), '2026-11-06')
  assert.equal(taskDay(null, 'UTC'), null)
})

test('a day with no midnight starts at its first instant', () => {
  // Chile moves its clocks forward at midnight on 2026-09-06.
  assert.equal(dayInZone(midnightInZone('2026-09-06', 'America/Santiago'), 'America/Santiago'), '2026-09-06')
  assert.equal(dayInZone(midnightInZone('2026-11-06', 'America/Los_Angeles'), 'America/Los_Angeles'), '2026-11-06')
})
