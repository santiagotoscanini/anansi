// The pure half of the TickTick sync: how a day becomes a TickTick date and
// back, and how a field that may have changed on either side is settled.
// No I/O here, so the rules are tested on their own (ticktick.test.ts); the
// sync itself is in ~/server/ticktick/sync.ts.

/** A YYYY-MM-DD calendar day. */
export type Day = string

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The calendar day an instant falls on in a time zone. */
export function dayInZone(instant: Date, timeZone: string): Day {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  )
}

/** How far ahead of UTC a zone's wall clock is at an instant, in ms. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wall - Math.floor(instant / 1000) * 1000
}

/** The instant a day starts in a time zone. */
export function midnightInZone(day: Day, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  // Twice, because the offset at the guess may differ from the offset at the
  // answer when a DST change sits between them. In a zone whose clocks jump
  // at midnight that day has no midnight, and the second pass would land on
  // the day before: the first one is then the day's first instant.
  const first = guess - zoneOffset(guess, timeZone)
  const second = guess - zoneOffset(first, timeZone)
  return new Date(dayInZone(new Date(second), timeZone) === day ? second : first)
}

/**
 * The day an Anansi date names, in the connection's zone. A date written as
 * exactly UTC midnight came from a caller that meant a calendar day (an MCP
 * tool given `2026-11-06`), so it is that UTC day; any other instant is read
 * in the zone, as the browser that wrote it would.
 */
export function taskDay(scheduledAt: Date | null, timeZone: string): Day | null {
  if (!scheduledAt) return null
  if (scheduledAt.getTime() % 86_400_000 === 0) return scheduledAt.toISOString().slice(0, 10)
  return dayInZone(scheduledAt, timeZone)
}

// ── Sections ────────────────────────────────────────────────────────────────
// The list mirrors Horizons: one section per bucket, and each open task sits in
// the one its due day puts it in (~/lib/horizon-period has the same rules for
// the board). Moving a task to another section in TickTick dates it the way a
// drop on Horizons does; Past due and Later are where tasks land, not where
// they can be put.
//
// They are in Horizons' order and carry its names, which move with the
// calendar ("November 2026", "Q4 2026", "2026"): a section is found by what
// its name looks like, not by the name it has today, and renamed when the
// month turns.

export const SECTIONS = [
  { key: 'backlog', order: 1000 },
  { key: 'past', order: 2000 },
  { key: 'month', order: 3000 },
  { key: 'quarter', order: 4000 },
  { key: 'year', order: 5000 },
  { key: 'later', order: 6000 },
] as const

export type SectionKey = (typeof SECTIONS)[number]['key']

const quarterOf = (month: number) => Math.floor((month - 1) / 3)

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const FIXED_NAMES = { past: 'Past due', later: 'Later', backlog: 'Backlog' } as const

/** The section's name today, as Horizons heads its column (`labelForBucket`). */
export function sectionName(section: SectionKey, today: Day): string {
  const [y, m] = today.split('-').map(Number) as [number, number]
  if (section === 'month') return `${MONTHS[m - 1]} ${y}`
  if (section === 'quarter') return `Q${quarterOf(m) + 1} ${y}`
  if (section === 'year') return String(y)
  return FIXED_NAMES[section]
}

const NAME_SHAPES: Record<'month' | 'quarter' | 'year', RegExp> = {
  month: new RegExp(`^(?:this month|(?:${MONTHS.join('|')}) \\d{4})$`, 'i'),
  quarter: /^(?:this quarter|q[1-4] \d{4})$/i,
  year: /^(?:this year|\d{4})$/i,
}

/**
 * Whether a section's name is one this section has had: any month's name for
 * the month section, and so on (and the "This month" kind the list had at
 * first).
 */
export function isSectionName(section: SectionKey, name: string): boolean {
  const n = name.trim()
  if (section === 'month' || section === 'quarter' || section === 'year') return NAME_SHAPES[section].test(n)
  return n.toLowerCase() === FIXED_NAMES[section].toLowerCase()
}

/** The section a due day puts a task in, today being `today`. */
export function sectionOf(due: Day | null, today: Day): SectionKey {
  if (!due) return 'backlog'
  if (due < today) return 'past'
  const [dy, dm] = due.split('-').map(Number) as [number, number]
  const [ty, tm] = today.split('-').map(Number) as [number, number]
  if (dy !== ty) return 'later'
  if (dm === tm) return 'month'
  if (quarterOf(dm) === quarterOf(tm)) return 'quarter'
  return 'year'
}

/**
 * The due day a task moved into a section gets: none in Backlog, the last day
 * of the month, quarter or year in theirs (Horizons' `endOfCurrentBucket`).
 * Undefined for Past due and Later, which a task cannot be moved into.
 */
export function dueForSection(section: SectionKey, today: Day): Day | null | undefined {
  const [y, m] = today.split('-').map(Number) as [number, number]
  const lastDay = (year: number, month: number) => {
    const d = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  if (section === 'backlog') return null
  if (section === 'month') return lastDay(y, m)
  if (section === 'quarter') return lastDay(y, quarterOf(m) * 3 + 3)
  if (section === 'year') return `${y}-12-31`
  return undefined
}

// ── Titles ──────────────────────────────────────────────────────────────────
// A task is named `{emoji} {title}` in TickTick, the emoji being the task's own
// or else its goal's, like the user's other lists.

const LEADING_EMOJI =
  /^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)️?\s+/u

export function composeTitle(emoji: string | null, title: string): string {
  return emoji ? `${emoji} ${title}` : title
}

/** A TickTick title without its leading emoji, if it has one. */
export function stripEmoji(title: string): string {
  return title.replace(LEADING_EMOJI, '')
}

/** The leading emoji of a TickTick title, or null. */
export function leadingEmoji(title: string): string | null {
  const m = LEADING_EMOJI.exec(title)
  return m ? m[0].trim() : null
}

/** TickTick's wire format, `yyyy-MM-dd'T'HH:mm:ssZ`, always written in UTC. */
export function toTickTickDate(instant: Date): string {
  return `${instant.toISOString().slice(0, 19)}+0000`
}

/** Reads `2019-11-13T03:00:00+0000` or `2026-03-05T00:00:00.000+0000`. */
export function parseTickTickDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const iso = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The day a TickTick task is due. An all-day date is the day's midnight in the
 * task's own zone, so it is read there; a timed one is read in the user's.
 */
export function remoteDueDay(
  task: { dueDate?: string | null; isAllDay?: boolean; timeZone?: string | null },
  userZone: string,
): Day | null {
  const due = parseTickTickDate(task.dueDate)
  if (!due) return null
  const zone = task.isAllDay && task.timeZone && isValidTimeZone(task.timeZone) ? task.timeZone : userZone
  return dayInZone(due, zone)
}

/** The TickTick fields that say "due on this day, all day" (or no date). */
export function dueFields(day: Day | null, timeZone: string) {
  if (!day) return { dueDate: null, startDate: null, isAllDay: false }
  const at = toTickTickDate(midnightInZone(day, timeZone))
  return { dueDate: at, startDate: at, isAllDay: true, timeZone }
}

/**
 * A three-way merge of one item: what Anansi has, what TickTick has, and what
 * the last sync agreed. A field changed on one side only takes that side; a
 * field changed on both takes Anansi's (a conflict means two edits inside one
 * sync window, and the local one is the one the user is looking at).
 *
 * `push` is what TickTick must be told, `pull` what Anansi must be told, and
 * `agreed` the next snapshot.
 */
export function mergeFields<T extends Record<string, unknown>>(
  local: T,
  remote: T,
  base: Partial<T>,
): { agreed: T; push: Partial<T>; pull: Partial<T> } {
  const agreed = { ...local }
  const push: Partial<T> = {}
  const pull: Partial<T> = {}
  for (const key of Object.keys(local) as (keyof T)[]) {
    const l = local[key]
    const r = remote[key]
    if (l === r) continue
    if (key in base && l === base[key]) {
      agreed[key] = r
      pull[key] = r
    } else {
      push[key] = l
    }
  }
  return { agreed, push, pull }
}

/** TickTick's task statuses: -1 won't do, 0 open, 2 completed. */
export function isDoneStatus(status: number | null | undefined): boolean {
  return status === 2 || status === -1
}
