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
  // answer when a DST change sits between them.
  let at = guess - zoneOffset(guess, timeZone)
  at = guess - zoneOffset(at, timeZone)
  return new Date(at)
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
