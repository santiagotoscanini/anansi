import { bucketForDate } from '~/lib/horizon-period'

// What Pulse shows, worked out once. The screen and the `get_pulse` MCP tool
// both call these, so a person flagged on one is flagged on the other. Pure, and
// nothing here reads the clock: the caller says when "now" is.

const DAY_MS = 24 * 60 * 60 * 1000
const FORTNIGHT_MS = 14 * DAY_MS

export type HorizonTask = {
  id: string
  title: string
  goalId: string
  goalTitle: string
  goalEmoji: string | undefined
  scheduledAt: Date
}

/** Open dated tasks by horizon, soonest first. Backlog and past-due stay out, as on the screen. */
export function horizonsOf(
  goals: readonly {
    id: string
    title: string
    emoji?: string
    tasks: readonly { id: string; title: string; completed: boolean; scheduledAt?: Date | null }[]
  }[],
  now: Date,
) {
  const month: HorizonTask[] = []
  const quarter: HorizonTask[] = []
  const year: HorizonTask[] = []
  for (const g of goals) {
    for (const task of g.tasks) {
      if (task.completed || !task.scheduledAt) continue
      const at = new Date(task.scheduledAt)
      const b = bucketForDate(at, now)
      const flat: HorizonTask = {
        id: task.id,
        title: task.title,
        goalId: g.id,
        goalTitle: g.title,
        goalEmoji: g.emoji,
        scheduledAt: at,
      }
      if (b === 'month') month.push(flat)
      else if (b === 'quarter') quarter.push(flat)
      else if (b === 'year') year.push(flat)
    }
  }
  const byDate = (a: HorizonTask, b: HorizonTask) =>
    a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.title.localeCompare(b.title)
  month.sort(byDate)
  quarter.sort(byDate)
  year.sort(byDate)
  return { month, quarter, year }
}

export type AttentionReason =
  | { kind: 'overdue'; daysOverdue: number; decideBy: Date }
  | { kind: 'due-soon'; daysUntil: number; decideBy: Date }
  | { kind: 'exploring-no-date' }
  | { kind: 'inbox' }

const reasonRank = (r: AttentionReason): number => {
  if (r.kind === 'overdue') return 0
  if (r.kind === 'due-soon') return 1
  if (r.kind === 'exploring-no-date') return 2
  return 3
}

/** People who need a decision: the inbox, and anyone being explored past or near their date. */
export function attentionOf<
  P extends { name: string; category: string | null; archivedAt: Date | null; decideBy: Date | null },
>(people: readonly P[], nowMs: number) {
  const rows: { person: P; reason: AttentionReason }[] = []
  for (const p of people) {
    if (p.archivedAt !== null) continue
    if (p.category === 'to_process') {
      rows.push({ person: p, reason: { kind: 'inbox' } })
      continue
    }
    if (p.category === 'exploring') {
      if (!p.decideBy) {
        rows.push({ person: p, reason: { kind: 'exploring-no-date' } })
        continue
      }
      const decideBy = new Date(p.decideBy)
      const diff = decideBy.getTime() - nowMs
      if (diff < 0) {
        rows.push({ person: p, reason: { kind: 'overdue', daysOverdue: Math.ceil(-diff / DAY_MS), decideBy } })
      } else if (diff <= FORTNIGHT_MS) {
        rows.push({ person: p, reason: { kind: 'due-soon', daysUntil: Math.round(diff / DAY_MS), decideBy } })
      }
    }
  }
  rows.sort((a, b) => {
    const r = reasonRank(a.reason) - reasonRank(b.reason)
    if (r !== 0) return r
    const aDate = 'decideBy' in a.reason ? a.reason.decideBy.getTime() : Number.POSITIVE_INFINITY
    const bDate = 'decideBy' in b.reason ? b.reason.decideBy.getTime() : Number.POSITIVE_INFINITY
    return aDate - bDate || a.person.name.localeCompare(b.person.name)
  })
  return rows
}

export type UpcomingRow =
  | { kind: 'date'; id: string; date: Date; daysUntil: number; person: string; label: string; turning: number | null }
  | {
      kind: 'bid'
      id: string
      date: Date
      daysUntil: number
      person: string
      personEmoji: string | null
      content: string
    }

/** The next 30 days of dates plus every upcoming bid, in one list. `today` is a local midnight. */
export function upcomingOf(
  importantDates: readonly {
    id: string
    personId: string
    label: string
    month: number
    day: number
    year: number | null
  }[],
  bids: readonly {
    id: string
    dueAt: Date | null
    personName: string
    personEmoji: string | null
    content: string
  }[],
  people: readonly { id: string; name: string; archivedAt: Date | null }[],
  today: Date,
) {
  const personById = new Map(people.map((p) => [p.id, p]))
  const feed: UpcomingRow[] = []
  for (const d of importantDates) {
    const person = personById.get(d.personId)
    const thisYear = new Date(today.getFullYear(), d.month - 1, d.day)
    const next = thisYear.getTime() < today.getTime() ? new Date(today.getFullYear() + 1, d.month - 1, d.day) : thisYear
    const daysUntil = Math.round((next.getTime() - today.getTime()) / DAY_MS)
    if (daysUntil < 0 || daysUntil > 30 || person?.archivedAt !== null) continue
    feed.push({
      kind: 'date',
      id: `date:${d.id}`,
      date: next,
      daysUntil,
      person: person.name,
      label: d.label,
      turning: d.year ? next.getFullYear() - d.year : null,
    })
  }
  for (const b of bids) {
    if (!b.dueAt) continue
    const due = new Date(b.dueAt)
    feed.push({
      kind: 'bid',
      id: `bid:${b.id}`,
      date: due,
      daysUntil: Math.round((due.getTime() - today.getTime()) / DAY_MS),
      person: b.personName,
      personEmoji: b.personEmoji,
      content: b.content,
    })
  }
  return feed.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Every item of a sync in the order the week set them, whatever goal each sits under. */
export function syncItemsOf<I extends { orderIdx: number; createdAt: Date }>(data: {
  goals: readonly { title: string; items: readonly I[] }[]
  unscopedItems: readonly I[]
}) {
  const flat = [
    ...data.goals.flatMap((g) => g.items.map((it) => ({ ...it, goalTitle: g.title }))),
    ...data.unscopedItems.map((it) => ({ ...it, goalTitle: null as string | null })),
  ]
  return flat.sort((a, b) => {
    const order = a.orderIdx - b.orderIdx
    return order !== 0 ? order : a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/** An item counts as answered once it has words or a file. */
export function isFilled(item: { textContent: string | null; attachments: readonly unknown[] }) {
  return (item.textContent ?? '').trim().length > 0 || item.attachments.length > 0
}
