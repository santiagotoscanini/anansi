// Period math for time-bound objectives. The data model is a single
// scheduledAt date per task; this module is responsible for deciding which
// "monthly / quarterly / yearly" bucket a date falls into right now.
//
// Auto-rollup: a task scheduled for September 15 sits in YEARLY until
// July 1, then in QUARTERLY through August, then promotes to MONTHLY when
// September arrives. The same date moves through buckets as time passes
// without anyone touching the row.

export type ScheduleBucket = 'past' | 'month' | 'quarter' | 'year' | 'later'

// Range helpers — each returns [start, end] inclusive of the entire period.
// All times are local; the caller is responsible for whether to compare in
// UTC or local. We compare via getTime() so we don't need to care.
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 0, 0, 0, 0)
}
function endOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0, 23, 59, 59, 999)
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0)
}
function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999)
}

export function currentMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  return { start: startOfMonth(now), end: endOfMonth(now) }
}
export function currentQuarterRange(now: Date = new Date()): { start: Date; end: Date } {
  return { start: startOfQuarter(now), end: endOfQuarter(now) }
}
export function currentYearRange(now: Date = new Date()): { start: Date; end: Date } {
  return { start: startOfYear(now), end: endOfYear(now) }
}

// Tightest bucket the date belongs to. Exclusive: a date in current month
// returns "month" (not also "quarter"); the columns nest naturally so the
// caller knows where to render the card.
export function bucketForDate(date: Date, now: Date = new Date()): ScheduleBucket {
  const t = date.getTime()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (t < today.getTime()) return 'past'
  const m = currentMonthRange(now)
  if (t <= m.end.getTime()) return 'month'
  const q = currentQuarterRange(now)
  if (t <= q.end.getTime()) return 'quarter'
  const y = currentYearRange(now)
  if (t <= y.end.getTime()) return 'year'
  return 'later'
}

// End-of-bucket date — used when dropping a task into a column to assign a
// concrete deadline. "By end of this month / quarter / year".
export function endOfCurrentBucket(bucket: Exclude<ScheduleBucket, 'past' | 'later'>, now: Date = new Date()): Date {
  if (bucket === 'month') return currentMonthRange(now).end
  if (bucket === 'quarter') return currentQuarterRange(now).end
  return currentYearRange(now).end
}

// Display strings for the chip and section headers.
export function formatScheduledShort(date: Date, now: Date = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear()
  if (sameYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
export function formatScheduledLong(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Header labels for the bucket sections — "April 2026" / "Q2 2026" / "2026".
export function labelForBucket(bucket: Exclude<ScheduleBucket, 'past' | 'later'>, now: Date = new Date()): string {
  if (bucket === 'month') return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (bucket === 'quarter') return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`
  return String(now.getFullYear())
}
