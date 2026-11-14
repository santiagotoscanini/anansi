/**
 * The Monday at or before `date`, at local midnight.
 *
 * The canonical week boundary for the whole app: `weekly_sync.week_date` stores
 * exactly this value, so anything that looks a sync up by week has to agree
 * with it to the millisecond. Local midnight, not UTC — a sync belongs to the
 * week the user experienced, not the one UTC was in.
 *
 * Was a `useCallback` on GoalsContext, which made a pure date calculation
 * reachable only from inside a React tree.
 */
export function weekStartOf(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay()
  // getDay() is 0 for Sunday, so Sunday walks back six days rather than forward.
  result.setDate(result.getDate() - day + (day === 0 ? -6 : 1))
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * The week a calendar day (`YYYY-MM-DD`) falls in, for a caller with no browser.
 *
 * `weekStartOf` needs the user's clock, and the server's is UTC: for a user in
 * UTC-3 the browser writes Monday 03:00Z and the server would compute Monday
 * 00:00Z, a different row in a table keyed on the instant. So a day is named by
 * the caller, and the week comes back as noon UTC on its Monday: the same
 * calendar day almost everywhere, and {@link WEEK_MATCH_MS} of any browser's own
 * Monday midnight.
 */
export function weekOfDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, date, 12))
  const weekday = result.getUTCDay()
  result.setUTCDate(result.getUTCDate() - weekday + (weekday === 0 ? -6 : 1))
  return result
}

/**
 * How far apart two instants can be and still name one week.
 *
 * Monday's local midnight spans 26 hours across every time zone, and two Mondays
 * are 168 apart, so 36 hours takes in every clock and no neighbouring week. This
 * is what lets a browser, a traveller on another clock and an MCP tool agree on
 * which sync is this week's.
 */
export const WEEK_MATCH_MS = 36 * 60 * 60 * 1000

/**
 * The calendar day (`YYYY-MM-DD`) of the Monday a stored `week_date` names.
 *
 * `week_date` is an instant, and which instant depends on who wrote it: local
 * midnight of that Monday from a browser (Sunday 10:00Z at UTC+14, Monday
 * 12:00Z at UTC-12), noon UTC from `weekOfDay`. Fourteen hours later every one
 * of them is on that Monday or early on its Tuesday in UTC, so the Monday at
 * or before the shifted instant is the week's own.
 */
export function mondayOf(weekDate: Date): string {
  const shifted = new Date(weekDate.getTime() + 14 * 60 * 60 * 1000)
  const weekday = shifted.getUTCDay()
  shifted.setUTCDate(shifted.getUTCDate() - weekday + (weekday === 0 ? -6 : 1))
  return shifted.toISOString().slice(0, 10)
}
