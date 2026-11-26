// The Life tab's rules: a life as a grid of weeks, and the chapters on it.
//
// Pure, and in calendar days (`YYYY-MM-DD`) throughout, never instants: a
// birthday and a chapter's dates are days on the user's own calendar, and the
// grid must look the same whichever clock renders it. Weeks run Sunday to
// Saturday like everywhere else in Anansi (`src/lib/week.ts`), so a cell is a
// real week, and a past one can carry that week's sync and journal.
//
// The grid: one row per year of age, starting at the birthday. Row `r` holds
// the weeks whose Sunday falls on or after the Sunday of the week of the r-th
// birthday and before that of the next, so a row has 52 cells, now and then 53.

export type Day = string

/** A chapter as the grid needs it. A null start is the birth, a null end the end of the expected life. */
export interface ChapterSpan {
  id: string
  startDay: Day | null
  endDay: Day | null
}

export interface LifeRow {
  /** Age in years during this row. */
  age: number
  /** The birthday that opens the row. */
  birthday: Day
  /** The Sundays of the row's weeks, in order. */
  weeks: Day[]
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function toUtc(day: Day): Date {
  const m = DAY_RE.exec(day)
  if (!m) throw new Error(`Not a calendar day: ${day}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function fromUtc(d: Date): Day {
  return d.toISOString().slice(0, 10)
}

export function isDay(value: unknown): value is Day {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false
  return fromUtc(toUtc(value)) === value
}

export function addDays(day: Day, n: number): Day {
  const d = toUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

/** The same day `n` years later; 29 February becomes 28 February in a common year. */
export function addYears(day: Day, n: number): Day {
  const d = toUtc(day)
  const year = d.getUTCFullYear() + n
  const month = d.getUTCMonth()
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return fromUtc(new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), last))))
}

/** The Sunday at or before a day. */
export function sundayOf(day: Day): Day {
  const d = toUtc(day)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return fromUtc(d)
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

/** Age in whole years on a day. */
export function ageOn(birth: Day, day: Day): number {
  let age = toUtc(day).getUTCFullYear() - toUtc(birth).getUTCFullYear()
  if (addYears(birth, age) > day) age -= 1
  return age
}

/** The last day of the expected life: the day before the birthday it ends on. */
export function lastDay(birth: Day, years: number): Day {
  return addDays(addYears(birth, years), -1)
}

/** The grid: one row per year of age, each a list of Sundays. */
export function lifeRows(birth: Day, years: number): LifeRow[] {
  const rows: LifeRow[] = []
  for (let age = 0; age < years; age++) {
    const birthday = addYears(birth, age)
    const from = sundayOf(birthday)
    const to = sundayOf(addYears(birth, age + 1))
    const weeks: Day[] = []
    for (let s = from; s < to; s = addDays(s, 7)) weeks.push(s)
    rows.push({ age, birthday, weeks })
  }
  return rows
}

/** A chapter's real first and last day, with the open ends filled in. */
export function chapterRange(chapter: ChapterSpan, birth: Day, years: number): { start: Day; end: Day } {
  return { start: chapter.startDay ?? birth, end: chapter.endDay ?? lastDay(birth, years) }
}

/** Whether a chapter touches the week that starts on `sunday`. */
export function coversWeek(range: { start: Day; end: Day }, sunday: Day): boolean {
  return range.start <= addDays(sunday, 6) && range.end >= sunday
}

/** How many weeks a chapter touches. */
export function chapterWeeks(range: { start: Day; end: Day }): number {
  if (range.end < range.start) return 0
  return daysBetween(sundayOf(range.start), sundayOf(range.end)) / 7 + 1
}

/** Where a chapter stands today. */
export function chapterTense(range: { start: Day; end: Day }, today: Day): 'past' | 'now' | 'future' {
  if (range.end < today) return 'past'
  if (range.start > today) return 'future'
  return 'now'
}

/**
 * For every week, the chapters on it, most specific first: the shortest
 * chapter wins the cell's colour ("Living in SF" over "My twenties"), ties go
 * to the one that started later. Answers a map from Sunday to chapter ids,
 * holding only the weeks some chapter touches.
 */
export function weekChapters<C extends ChapterSpan>(chapters: readonly C[], birth: Day, years: number) {
  const ranged = chapters
    .map((c) => {
      const range = chapterRange(c, birth, years)
      return { id: c.id, range, weeks: chapterWeeks(range) }
    })
    .filter((c) => c.weeks > 0)
    .sort((a, b) => a.weeks - b.weeks || (a.range.start < b.range.start ? 1 : a.range.start > b.range.start ? -1 : 0))
  const byWeek = new Map<Day, string[]>()
  for (const c of ranged) {
    for (let s = sundayOf(c.range.start); s <= c.range.end; s = addDays(s, 7)) {
      const list = byWeek.get(s)
      if (list) list.push(c.id)
      else byWeek.set(s, [c.id])
    }
  }
  return byWeek
}

/**
 * A loose day as people say it, made exact: `2005` and `2005-03` widen to the
 * first or the last day of the year or month, depending on which end of a
 * chapter it is. A full day passes through. Anything else is null.
 */
export function looseDay(value: string, end: 'start' | 'end'): Day | null {
  const v = value.trim()
  if (/^\d{4}$/.test(v)) return end === 'start' ? `${v}-01-01` : `${v}-12-31`
  const ym = /^(\d{4})-(\d{2})$/.exec(v)
  if (ym) {
    const month = Number(ym[2])
    if (month < 1 || month > 12) return null
    if (end === 'start') return `${v}-01`
    const last = new Date(Date.UTC(Number(ym[1]), month, 0)).getUTCDate()
    return `${v}-${String(last).padStart(2, '0')}`
  }
  return isDay(v) ? v : null
}

/** A chapter's span in words, as short as its dates allow: "2005 → 2011", "Mar 2019 → the end". */
export function spanLabel(
  range: { start: Day; end: Day },
  opts: { locale: string; birth: Day; years: number; today: Day; labels: { birth: string; end: string; now: string } },
): string {
  const fmt = (day: Day, side: 'start' | 'end') => {
    if (side === 'start' && day === opts.birth) return opts.labels.birth
    if (side === 'end' && day === lastDay(opts.birth, opts.years)) return opts.labels.end
    const d = toUtc(day)
    const wholeYear = side === 'start' ? day.endsWith('-01-01') : day.endsWith('-12-31')
    if (wholeYear) return String(d.getUTCFullYear())
    return d.toLocaleDateString(opts.locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return `${fmt(range.start, 'start')} → ${fmt(range.end, 'end')}`
}

/** A chapter's length in words-ready numbers: whole years and leftover months. */
export function chapterLength(range: { start: Day; end: Day }): { years: number; months: number; weeks: number } {
  const end = addDays(range.end, 1)
  const a = toUtc(range.start)
  const b = toUtc(end)
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) months -= 1
  months = Math.max(0, months)
  return { years: Math.floor(months / 12), months: months % 12, weeks: chapterWeeks(range) }
}

/**
 * The chapter colours: muted, warm, distinct from one another in both themes,
 * and in step with the app's own clay, moss, indigo, amber, rust and plum.
 */
export const CHAPTER_COLORS = [
  '#c2673f', // clay
  '#6f8f4e', // moss
  '#56689e', // indigo
  '#d29a3a', // amber
  '#9c5a7c', // plum
  '#3f8a86', // teal
  '#b5483a', // rust
  '#7c6aa8', // lavender
  '#8a7a52', // olive
  '#4a7fb0', // lake
  '#c07a8e', // rose
  '#5e6b5a', // slate green
] as const

/** The first colour no chapter uses yet, else the next in turn. */
export function nextChapterColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return CHAPTER_COLORS.find((c) => !taken.has(c)) ?? CHAPTER_COLORS[used.length % CHAPTER_COLORS.length]!
}
