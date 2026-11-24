// Apple Health, as the phone sends it: one row per calendar day of daily totals (never raw samples). The phone
// reads HealthKit and sends the last days again on every run, so a day is replaced by its latest send. The phone's
// side is ios/Packages/AnansiKit/Sources/AnansiFeature/Core/Health.swift: keep the fields in step.
//
// A tracking item can follow one metric (`HEALTH_METRICS`); its week in a sync then shows that metric over the
// week's days (`weekSummary`), computed when read, never stored.
import { z } from 'zod'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const count = z.number().int().min(0).max(1_000_000)
const instant = z.string().max(40)

export const healthDayDataSchema = z.object({
  sleepMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  bedtime: instant.optional(),
  wakeTime: instant.optional(),
  steps: count.optional(),
  activeEnergyKcal: count.optional(),
  exerciseMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  workouts: z
    .array(
      z.object({
        type: z.string().min(1).max(40),
        minutes: z
          .number()
          .int()
          .min(0)
          .max(24 * 60),
        energyKcal: count.optional(),
      }),
    )
    .max(30)
    .optional(),
  weightKg: z.number().min(0).max(500).optional(),
  bodyFatPercent: z.number().min(0).max(100).optional(),
  restingHeartRate: z.number().min(0).max(300).optional(),
  hrvMs: z.number().min(0).max(1000).optional(),
})

export type HealthDayData = z.infer<typeof healthDayDataSchema>

export const healthDaysInputSchema = z.object({
  days: z.array(healthDayDataSchema.extend({ day })).min(1).max(400),
})

export type HealthDaysInput = z.infer<typeof healthDaysInputSchema>

/** What a tracking item can follow, and how a week of it reads. */
export const HEALTH_METRICS = {
  sleep: { label: 'Sleep', unit: 'h', field: 'sleepMinutes', over: 'average', scale: 1 / 60, digits: 1 },
  steps: { label: 'Steps', unit: 'steps', field: 'steps', over: 'average', scale: 1, digits: 0 },
  activeEnergy: {
    label: 'Active energy',
    unit: 'kcal',
    field: 'activeEnergyKcal',
    over: 'average',
    scale: 1,
    digits: 0,
  },
  exercise: { label: 'Exercise', unit: 'min', field: 'exerciseMinutes', over: 'total', scale: 1, digits: 0 },
  workouts: { label: 'Workouts', unit: 'workouts', field: 'workouts', over: 'count', scale: 1, digits: 0 },
  weight: { label: 'Weight', unit: 'kg', field: 'weightKg', over: 'last', scale: 1, digits: 1 },
  bodyFat: { label: 'Body fat', unit: '%', field: 'bodyFatPercent', over: 'last', scale: 1, digits: 1 },
  restingHeartRate: {
    label: 'Resting heart rate',
    unit: 'bpm',
    field: 'restingHeartRate',
    over: 'average',
    scale: 1,
    digits: 0,
  },
  hrv: { label: 'HRV', unit: 'ms', field: 'hrvMs', over: 'average', scale: 1, digits: 0 },
} as const satisfies Record<
  string,
  {
    label: string
    unit: string
    field: keyof HealthDayData
    over: 'average' | 'total' | 'count' | 'last'
    scale: number
    digits: number
  }
>

export type HealthMetric = keyof typeof HEALTH_METRICS
export const healthMetricSchema = z.enum(Object.keys(HEALTH_METRICS) as [HealthMetric, ...HealthMetric[]])

export interface WeekSummary {
  metric: HealthMetric
  /** The week's figure (average, total, count or last reading, per the metric), rounded; null with no data. */
  value: number | null
  unit: string
  /** How many of the week's days had a reading. */
  days: number
  /** Each day of the week, oldest first, with its own figure or null. */
  daily: { day: string; value: number | null }[]
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

/** One day's figure for a metric, scaled to its unit, or null. */
export function dayValue(metric: HealthMetric, data: HealthDayData | undefined): number | null {
  if (!data) return null
  const m = HEALTH_METRICS[metric]
  if (m.field === 'workouts') {
    const n = data.workouts?.length ?? 0
    return n > 0 ? n : null
  }
  const raw = data[m.field]
  return typeof raw === 'number' ? round(raw * m.scale, m.digits) : null
}

/** A metric over the days of a week (`days`, oldest first), from whatever rows exist for them. */
export function weekSummary(metric: HealthMetric, days: string[], rows: Map<string, HealthDayData>): WeekSummary {
  const m = HEALTH_METRICS[metric]
  const daily = days.map((d) => ({ day: d, value: dayValue(metric, rows.get(d)) }))
  const present = daily.filter((d): d is { day: string; value: number } => d.value !== null)
  let value: number | null = null
  if (present.length) {
    const sum = present.reduce((s, d) => s + d.value, 0)
    if (m.over === 'average') value = round(sum / present.length, m.digits)
    else if (m.over === 'last') value = present[present.length - 1]?.value ?? null
    else value = round(sum, m.digits)
  }
  return { metric, value, unit: m.unit, days: present.length, daily }
}

/** The seven calendar days of the week that starts on `sunday` (`YYYY-MM-DD`), Sunday first. */
export function weekDays(sunday: string): string[] {
  const [y = 0, m = 1, d = 1] = sunday.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
}
