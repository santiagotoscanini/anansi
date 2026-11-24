// Anansi's week runs Sunday to Saturday, everywhere: the weekly sync, Pulse,
// Over time, the date picker and the phone (`LocalDay.weekStart`). A sync done
// on a Sunday night is the start of the new week, not the end of the old one.

/**
 * The Sunday at or before `date`, at local midnight.
 *
 * The canonical week boundary for the whole app: `weekly_sync.week_date` stores
 * exactly this value from a browser, so anything that looks a sync up by week
 * has to agree with it (to within {@link WEEK_MATCH_MS}). Local midnight, not
 * UTC: a sync belongs to the week the user experienced, not the one UTC was in.
 */
export function weekStartOf(date: Date): Date {
  const result = new Date(date)
  // getDay() is 0 for Sunday, so it is also the number of days since Sunday.
  result.setDate(result.getDate() - result.getDay())
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * The week a calendar day (`YYYY-MM-DD`) falls in, for a caller with no browser.
 *
 * `weekStartOf` needs the user's clock, and the server's is UTC: for a user in
 * UTC-5 the browser writes Sunday 05:00Z and the server would compute Sunday
 * 00:00Z, a different row in a table keyed on the instant. So a day is named by
 * the caller, and the week comes back as noon UTC on its Sunday: the same
 * calendar day almost everywhere, and {@link WEEK_MATCH_MS} of any browser's own
 * Sunday midnight.
 */
export function weekOfDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, date, 12))
  result.setUTCDate(result.getUTCDate() - result.getUTCDay())
  return result
}

/**
 * How far apart two instants can be and still name one week.
 *
 * Sunday's local midnight spans 26 hours across every time zone, and two Sundays
 * are 168 apart, so 36 hours takes in every clock and no neighbouring week. This
 * is what lets a browser, a traveller on another clock and an MCP tool agree on
 * which sync is this week's.
 */
export const WEEK_MATCH_MS = 36 * 60 * 60 * 1000

/**
 * The calendar day (`YYYY-MM-DD`) of the Sunday a stored `week_date` names.
 *
 * `week_date` is an instant, and which instant depends on who wrote it: local
 * midnight of that Sunday from a browser (Saturday 10:00Z at UTC+14, Sunday
 * 12:00Z at UTC-12), noon UTC from `weekOfDay`. Fourteen hours later every one
 * of them is on that Sunday or early on its Monday in UTC, so the Sunday at or
 * before the shifted instant is the week's own.
 */
export function weekDayOf(weekDate: Date): string {
  const shifted = new Date(weekDate.getTime() + 14 * 60 * 60 * 1000)
  shifted.setUTCDate(shifted.getUTCDate() - shifted.getUTCDay())
  return shifted.toISOString().slice(0, 10)
}
