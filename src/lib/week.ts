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
