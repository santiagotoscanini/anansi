// Apple Health, as the phone sends it (shape and metrics: ~/lib/health). One row per user per calendar day; a send
// replaces each day it names, so the latest send wins (a watch that synced late corrects its day). Read back as
// days, or as a tracking item's week (`weekSummary`), computed on read and never stored.
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/data'
import { healthDays } from '~/lib/data/schema'
import {
  HEALTH_METRICS,
  healthDaysInputSchema,
  weekDays,
  weekSummary,
  type HealthDayData,
  type HealthMetric,
  type WeekSummary,
} from '~/lib/health'
import { isCalendarDay } from '~/lib/journal'
import { AppError } from './errors'

const calendarDay = z.string().refine(isCalendarDay, 'a calendar day, YYYY-MM-DD')

/** Stores each day of the payload, replacing what the day held. Answers how many days were saved. */
export async function saveDays(userId: string, input: unknown) {
  const { days } = healthDaysInputSchema.parse(input)
  for (const d of days) {
    if (!isCalendarDay(d.day)) throw new AppError('BAD_REQUEST', `${d.day} is not a calendar day`)
  }
  // The last copy of a day in one payload wins, like a later send would.
  const byDay = new Map(days.map(({ day, ...data }) => [day, data] as const))
  const rows = [...byDay].map(([day, data]) => ({ userId, day, data }))
  await db
    .insert(healthDays)
    .values(rows)
    .onConflictDoUpdate({
      target: [healthDays.userId, healthDays.day],
      set: { data: sql`excluded.data`, updatedAt: new Date() },
    })
  return { saved: rows.length }
}

const MAX_RANGE_DAYS = 400

export const listDaysSchema = z.object({ from: calendarDay, to: calendarDay })

/** The days from `from` to `to` (both included) that have data, oldest first. */
export async function listDays(userId: string, input: { from: string; to: string }) {
  const { from, to } = listDaysSchema.parse(input)
  if (from > to) throw new AppError('BAD_REQUEST', '`from` is after `to`')
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) {
    throw new AppError('BAD_REQUEST', `Ask for at most ${MAX_RANGE_DAYS} days at a time`)
  }
  return await between(userId, from, to)
}

function between(userId: string, from: string, to: string) {
  return db
    .select({ day: healthDays.day, data: healthDays.data })
    .from(healthDays)
    .where(and(eq(healthDays.userId, userId), gte(healthDays.day, from), lte(healthDays.day, to)))
    .orderBy(asc(healthDays.day))
}

/** The days from `from` to `to` as a map, for `weekSummary`. No range limit: a history spans years. */
async function rowsBetween(userId: string, from: string, to: string) {
  const rows = await between(userId, from, to)
  return new Map(rows.map((r) => [r.day, r.data] as const))
}

/** The week that starts on `sunday`: its seven days with whatever data each has. */
export async function weekFor(userId: string, sunday: string) {
  const days = weekDays(calendarDay.parse(sunday))
  const rows = await rowsBetween(userId, days[0] ?? sunday, days[6] ?? sunday)
  return days.map((day) => ({ day, data: rows.get(day) ?? null }))
}

export type HealthSummary = WeekSummary & { label: string }

/**
 * Each metric over each of `sundays`' weeks, from one read. Answers a function from (metric, sunday) to the
 * summary, with the metric's label (English, for MCP; the screens label it themselves).
 */
export async function summariesFor(userId: string, sundays: readonly string[]) {
  const sorted = [...new Set(sundays)].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const rows =
    first && last ? await rowsBetween(userId, first, weekDays(last)[6] ?? last) : new Map<string, HealthDayData>()
  return (metric: HealthMetric, sunday: string): HealthSummary => ({
    ...weekSummary(metric, weekDays(sunday), rows),
    label: HEALTH_METRICS[metric].label,
  })
}
