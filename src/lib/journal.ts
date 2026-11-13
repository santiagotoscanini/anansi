// The journal's calendar days. A day is the user's own, `YYYY-MM-DD`, never an
// instant. (How its text names people: ~/lib/mentions.)

/** True for a real calendar day written `YYYY-MM-DD` (so not February 31st). */
export function isCalendarDay(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return false
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return date.toISOString().slice(0, 10) === day
}

/** `day` moved by `delta` days. */
export function shiftDay(day: string, delta: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** The calendar day on this clock: the browser's, where "today" is the user's. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
