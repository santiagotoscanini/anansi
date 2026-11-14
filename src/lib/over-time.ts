// One tracking item over time: the pure half of the Over time screen. What a
// frame is, where a week sits on the timeline, which weeks are missing. No
// React and no clock, so the web screen and its tests read the same answers.
// The phone has the same rules in ios/…/Core/History.swift.
//
// A week is its Monday as a calendar day (`YYYY-MM-DD`), which is how the
// service names it (`mondayOf`).

export interface HistoryAttachment {
  id: string
  fileName: string
  fileType: string
  url: string
}

export interface HistoryWeek {
  syncItemId: string
  week: string
  textContent: string | null
  attachments: HistoryAttachment[]
}

/** One picture of the item, in the order it is played. */
export interface Frame {
  /** The attachment id. */
  key: string
  url: string
  fileName: string
  week: string
  /** That week's notes, shown beside the picture. */
  note: string | null
  /** 1-based place among the week's pictures, and how many it has. */
  shot: number
  shots: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Noon UTC of a calendar day: a stable instant to do day arithmetic on. */
export function dayTime(day: string): number {
  return Date.parse(`${day}T12:00:00Z`)
}

/** Every picture, oldest week first, a week's pictures in the order they were added. */
export function framesOf(weeks: readonly HistoryWeek[]): Frame[] {
  return weeks.flatMap((week) => {
    const images = week.attachments.filter((a) => a.fileType === 'image')
    return images.map((image, i) => ({
      key: image.id,
      url: image.url,
      fileName: image.fileName,
      week: week.week,
      note: week.textContent,
      shot: i + 1,
      shots: images.length,
    }))
  })
}

/** Whole weeks from one Monday to another (negative when `to` is earlier). */
export function weeksBetween(from: string, to: string): number {
  return Math.round((dayTime(to) - dayTime(from)) / (7 * DAY_MS))
}

/** Where a day sits between the first and the last, 0 to 1. One week alone sits in the middle. */
export function positionOf(day: string, first: string, last: string): number {
  const span = dayTime(last) - dayTime(first)
  if (span <= 0) return 0.5
  return Math.min(1, Math.max(0, (dayTime(day) - dayTime(first)) / span))
}

/** Each frame's place on the timeline. Pictures of one week share a place. */
export function framePositions(frames: readonly Frame[]): number[] {
  const first = frames[0]?.week
  const last = frames.at(-1)?.week
  if (!first || !last) return []
  return frames.map((frame) => positionOf(frame.week, first, last))
}

/** The frame closest to a point on the timeline (0 to 1). Of equals, the earlier. */
export function nearestFrame(positions: readonly number[], at: number): number {
  let best = 0
  let distance = Infinity
  positions.forEach((position, i) => {
    const d = Math.abs(position - at)
    if (d < distance) {
      best = i
      distance = d
    }
  })
  return best
}

export interface MonthTick {
  /** The first day of the month. */
  day: string
  position: number
}

/** The months that start between the first week and the last, thinned to at most `max` labels. */
export function monthTicks(first: string, last: string, max = 8): MonthTick[] {
  const ticks: MonthTick[] = []
  const [startYear = 0, startMonth = 1] = first.split('-').map(Number)
  for (let i = 1; ; i++) {
    const day = new Date(Date.UTC(startYear, startMonth - 1 + i, 1)).toISOString().slice(0, 10)
    if (dayTime(day) > dayTime(last)) break
    ticks.push({ day, position: positionOf(day, first, last) })
  }
  if (ticks.length <= max) return ticks
  const step = Math.ceil(ticks.length / max)
  return ticks.filter((_, i) => i % step === 0)
}

export type SheetEntry = { kind: 'week'; week: HistoryWeek } | { kind: 'gap'; from: string; weeks: number }

export interface SheetMonth {
  /** `YYYY-MM`. */
  month: string
  entries: SheetEntry[]
}

/**
 * The weeks as a contact sheet: grouped by the month of their Monday, with the
 * weeks that recorded nothing in between folded into one gap each. A gap sits
 * in the month of its first missing week.
 */
export function contactSheet(weeks: readonly HistoryWeek[]): SheetMonth[] {
  const entries: (SheetEntry & { day: string })[] = []
  weeks.forEach((week, i) => {
    const previous = weeks[i - 1]
    if (previous) {
      const missing = weeksBetween(previous.week, week.week) - 1
      if (missing > 0) {
        const from = new Date(dayTime(previous.week) + 7 * DAY_MS).toISOString().slice(0, 10)
        entries.push({ kind: 'gap', from, weeks: missing, day: from })
      }
    }
    entries.push({ kind: 'week', week, day: week.week })
  })

  const months: SheetMonth[] = []
  for (const { day, ...entry } of entries) {
    const month = day.slice(0, 7)
    const current = months.at(-1)
    if (current?.month === month) current.entries.push(entry)
    else months.push({ month, entries: [entry] })
  }
  return months
}
