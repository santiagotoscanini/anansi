import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addYears,
  ageOn,
  chapterLength,
  chapterRange,
  chapterTense,
  lastDay,
  lifeRows,
  looseDay,
  nextChapterColor,
  CHAPTER_COLORS,
  sundayOf,
  weekChapters,
} from './life.ts'

const BIRTH = '1999-05-03' // a Monday

test('rows start at each birthday and hold every week once', () => {
  const rows = lifeRows(BIRTH, 80)
  assert.equal(rows.length, 80)
  assert.equal(rows[0]!.weeks[0], '1999-05-02', 'the week of the birth, from its Sunday')
  for (const r of rows) assert.ok(r.weeks.length === 52 || r.weeks.length === 53, `${r.age}: ${r.weeks.length}`)
  // Contiguous: each row picks up the Sunday after the last one.
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!.weeks.at(-1)!
    const next = rows[i]!.weeks[0]!
    assert.equal(new Date(`${next}T00:00:00Z`).getTime() - new Date(`${prev}T00:00:00Z`).getTime(), 7 * 86_400_000)
  }
  const all = rows.flatMap((r) => r.weeks)
  assert.equal(new Set(all).size, all.length)
})

test('ages and leap birthdays', () => {
  assert.equal(ageOn(BIRTH, '2026-05-02'), 26)
  assert.equal(ageOn(BIRTH, '2026-05-03'), 27)
  assert.equal(addYears('2000-02-29', 1), '2001-02-28')
  assert.equal(lastDay(BIRTH, 80), '2079-05-02')
})

test('loose days widen to the right end', () => {
  assert.equal(looseDay('2005', 'start'), '2005-01-01')
  assert.equal(looseDay('2011', 'end'), '2011-12-31')
  assert.equal(looseDay('2024-02', 'end'), '2024-02-29')
  assert.equal(looseDay('2024-02', 'start'), '2024-02-01')
  assert.equal(looseDay('2024-02-30', 'start'), null)
  assert.equal(looseDay('2024-13', 'end'), null)
})

test('open ends are the birth and the end of the expected life', () => {
  const range = chapterRange({ id: 'a', startDay: null, endDay: null }, BIRTH, 80)
  assert.deepEqual(range, { start: BIRTH, end: '2079-05-02' })
  assert.equal(chapterTense(range, '2026-11-26'), 'now')
  assert.equal(chapterTense({ start: '2005-01-01', end: '2011-12-31' }, '2026-11-26'), 'past')
  assert.equal(chapterTense({ start: '2030-01-01', end: '2035-12-31' }, '2026-11-26'), 'future')
})

test('the shortest chapter wins a week', () => {
  const life = { id: 'life', startDay: null, endDay: null }
  const sf = { id: 'sf', startDay: '2027-01-01', endDay: '2031-12-31' }
  const map = weekChapters([life, sf], BIRTH, 80)
  assert.deepEqual(map.get(sundayOf('2028-06-15')), ['sf', 'life'])
  assert.deepEqual(map.get(sundayOf('2026-06-15')), ['life'])
})

test('lengths', () => {
  assert.deepEqual(chapterLength({ start: '2005-01-01', end: '2011-12-31' }).years, 7)
  assert.deepEqual(chapterLength({ start: '2026-03-01', end: '2026-08-31' }).months, 6)
})

test('a new chapter takes an unused colour', () => {
  assert.equal(nextChapterColor([]), CHAPTER_COLORS[0])
  assert.equal(nextChapterColor([CHAPTER_COLORS[0]]), CHAPTER_COLORS[1])
})
