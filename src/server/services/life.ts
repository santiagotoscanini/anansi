// The Life tab: a life as weeks, the chapters on it and the views that pick a
// few of them. See "Life" in AGENTS.md.
//
// The birth date and the life expectancy live on `users`; chapters and views
// are their own tables. `overview` is the one read the tab needs: settings,
// chapters with their goals, views with their chapters, and per week what was
// recorded (filled sync items, journal days, pictures), so past weeks on the
// grid can carry the user's own record.
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '~/lib/data'
import {
  attachments,
  goals,
  journalEntries,
  lifeChapterGoals,
  lifeChapters,
  lifeViewChapters,
  lifeViews,
  syncItemBlocks,
  trackingItems,
  users,
  weeklySync,
  weeklySyncItems,
} from '~/lib/data/schema'
import {
  createLifeChapterSchema,
  createLifeViewSchema,
  lifeSettingsSchema,
  lifeWeekSchema,
  reorderLifeViewsSchema,
  updateLifeChapterSchema,
  updateLifeViewSchema,
} from '~/lib/api/life'
import { addDays, chapterRange, nextChapterColor, sundayOf } from '~/lib/life'
import { WEEK_MATCH_MS, weekDayOf, weekOfDay } from '~/lib/week'
import { AppError } from './errors'

export interface WeekRecord {
  /** Sync items with notes, a block or a file that week. */
  sync: number
  /** Journal days written that week. */
  journal: number
  /** Pictures from that week's sync and journal. */
  pictures: number
}

export async function settings(userId: string) {
  const [row] = await db
    .select({ birthDate: users.birthDate, lifeExpectancyYears: users.lifeExpectancyYears })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'User not found')
  return row
}

export async function setSettings(userId: string, raw: unknown) {
  const input = lifeSettingsSchema.parse(raw)
  const patch: { birthDate?: string | null; lifeExpectancyYears?: number; updatedAt: Date } = { updatedAt: new Date() }
  if (input.birthDate !== undefined) {
    if (input.birthDate && input.birthDate > new Date().toISOString().slice(0, 10)) {
      throw new AppError('BAD_REQUEST', 'A birth date cannot be in the future')
    }
    patch.birthDate = input.birthDate
  }
  if (input.lifeExpectancyYears !== undefined) patch.lifeExpectancyYears = input.lifeExpectancyYears
  await db.update(users).set(patch).where(eq(users.id, userId))
  return settings(userId)
}

async function chaptersOf(userId: string) {
  const rows = await db.select().from(lifeChapters).where(eq(lifeChapters.userId, userId))
  if (rows.length === 0) return []
  // Links to archived goals are hidden, like everywhere a goal is linked.
  const links = await db
    .select({ chapterId: lifeChapterGoals.chapterId, goalId: lifeChapterGoals.goalId })
    .from(lifeChapterGoals)
    .innerJoin(goals, eq(goals.id, lifeChapterGoals.goalId))
    .where(
      and(
        inArray(
          lifeChapterGoals.chapterId,
          rows.map((r) => r.id),
        ),
        eq(goals.status, 'active'),
      ),
    )
  const chapters = rows.map(({ userId: _u, ...c }) => ({
    ...c,
    goalIds: links.filter((l) => l.chapterId === c.id).map((l) => l.goalId),
  }))
  // Oldest start first; "since birth" is the oldest of all.
  return chapters.sort(
    (a, b) =>
      (a.startDay ?? '').localeCompare(b.startDay ?? '') ||
      (a.endDay ?? '9999').localeCompare(b.endDay ?? '9999') ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

async function viewsOf(userId: string) {
  const rows = await db
    .select()
    .from(lifeViews)
    .where(eq(lifeViews.userId, userId))
    .orderBy(asc(lifeViews.orderIdx), asc(lifeViews.createdAt))
  if (rows.length === 0) return []
  const links = await db
    .select({ viewId: lifeViewChapters.viewId, chapterId: lifeViewChapters.chapterId })
    .from(lifeViewChapters)
    .where(
      inArray(
        lifeViewChapters.viewId,
        rows.map((r) => r.id),
      ),
    )
  return rows.map(({ userId: _u, ...v }) => ({
    ...v,
    chapterIds: links.filter((l) => l.viewId === v.id).map((l) => l.chapterId),
  }))
}

/** What each week recorded, keyed by its Sunday. Weeks with nothing are absent. */
async function weekRecords(userId: string): Promise<Record<string, WeekRecord>> {
  const out: Record<string, WeekRecord> = {}
  const at = (sunday: string) => (out[sunday] ??= { sync: 0, journal: 0, pictures: 0 })

  const syncs = await db
    .select({ id: weeklySync.id, weekDate: weeklySync.weekDate })
    .from(weeklySync)
    .where(eq(weeklySync.userId, userId))
  const weekOfSync = new Map(syncs.map((s) => [s.id, weekDayOf(s.weekDate)] as const))
  const items = syncs.length
    ? await db
        .select({ id: weeklySyncItems.id, syncId: weeklySyncItems.weeklySyncId, text: weeklySyncItems.textContent })
        .from(weeklySyncItems)
        .where(inArray(weeklySyncItems.weeklySyncId, [...weekOfSync.keys()]))
    : []
  const weekOfItem = new Map(items.map((i) => [i.id, weekOfSync.get(i.syncId)!] as const))
  const blocks = items.length
    ? await db
        .select({ itemId: syncItemBlocks.weeklySyncItemId })
        .from(syncItemBlocks)
        .where(inArray(syncItemBlocks.weeklySyncItemId, [...weekOfItem.keys()]))
    : []

  const entries = await db
    .select({ id: journalEntries.id, day: journalEntries.day })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
  const weekOfEntry = new Map(entries.map((e) => [e.id, sundayOf(e.day)] as const))

  const files = await db
    .select({ parentType: attachments.parentType, parentId: attachments.parentId, fileType: attachments.fileType })
    .from(attachments)
    .where(eq(attachments.userId, userId))

  const filled = new Set<string>()
  for (const i of items) if (i.text?.trim()) filled.add(i.id)
  for (const b of blocks) filled.add(b.itemId)
  for (const f of files) {
    if (f.parentType === 'weekly_sync_item' && weekOfItem.has(f.parentId)) {
      filled.add(f.parentId)
      if (f.fileType === 'image') at(weekOfItem.get(f.parentId)!).pictures++
    } else if (f.parentType === 'journal_entry' && weekOfEntry.has(f.parentId)) {
      if (f.fileType === 'image') at(weekOfEntry.get(f.parentId)!).pictures++
    }
  }
  for (const id of filled) at(weekOfItem.get(id)!).sync++
  for (const e of entries) at(sundayOf(e.day)).journal++
  return out
}

/** Everything the Life tab draws. */
export async function overview(userId: string) {
  const [s, chapters, views, weeks] = await Promise.all([
    settings(userId),
    chaptersOf(userId),
    viewsOf(userId),
    weekRecords(userId),
  ])
  return { ...s, chapters, views, weeks }
}

/** The chapters alone, with their goals and views: what a conversation needs to see a life. */
export async function list(userId: string) {
  const [s, chapters, views] = await Promise.all([settings(userId), chaptersOf(userId), viewsOf(userId)])
  return { ...s, chapters, views }
}

async function assertGoals(userId: string, ids: readonly string[]) {
  const want = [...new Set(ids)]
  if (want.length === 0) return want
  const found = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, 'active'), inArray(goals.id, want)))
  if (found.length !== want.length) {
    const ok = new Set(found.map((g) => g.id))
    throw new AppError('BAD_REQUEST', `Unknown goal ${want.find((id) => !ok.has(id))}`)
  }
  return want
}

async function assertViews(userId: string, ids: readonly string[]) {
  const want = [...new Set(ids)]
  if (want.length === 0) return want
  const found = await db
    .select({ id: lifeViews.id })
    .from(lifeViews)
    .where(and(eq(lifeViews.userId, userId), inArray(lifeViews.id, want)))
  if (found.length !== want.length) {
    const ok = new Set(found.map((v) => v.id))
    throw new AppError('BAD_REQUEST', `Unknown view ${want.find((id) => !ok.has(id))}`)
  }
  return want
}

async function assertChapters(userId: string, ids: readonly string[]) {
  const want = [...new Set(ids)]
  if (want.length === 0) return want
  const found = await db
    .select({ id: lifeChapters.id })
    .from(lifeChapters)
    .where(and(eq(lifeChapters.userId, userId), inArray(lifeChapters.id, want)))
  if (found.length !== want.length) {
    const ok = new Set(found.map((c) => c.id))
    throw new AppError('BAD_REQUEST', `Unknown chapter ${want.find((id) => !ok.has(id))}`)
  }
  return want
}

function assertOrder(startDay: string | null, endDay: string | null) {
  if (startDay && endDay && endDay < startDay) {
    throw new AppError('BAD_REQUEST', `A chapter cannot end (${endDay}) before it starts (${startDay})`)
  }
}

async function chapterOut(userId: string, id: string) {
  const all = await chaptersOf(userId)
  const chapter = all.find((c) => c.id === id)
  if (!chapter) throw new AppError('NOT_FOUND', 'Chapter not found')
  return chapter
}

export async function createChapter(userId: string, raw: unknown) {
  const input = createLifeChapterSchema.parse(raw)
  const startDay = input.startDay ?? null
  const endDay = input.endDay ?? null
  assertOrder(startDay, endDay)
  const goalIds = await assertGoals(userId, input.goalIds ?? [])
  const viewIds = await assertViews(userId, input.viewIds ?? [])
  let color = input.color
  if (!color) {
    const used = await db
      .select({ color: lifeChapters.color })
      .from(lifeChapters)
      .where(eq(lifeChapters.userId, userId))
    color = nextChapterColor(used.map((u) => u.color))
  }
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(lifeChapters)
      .values({
        userId,
        title: input.title,
        emoji: input.emoji ?? null,
        color,
        notes: input.notes?.trim() ? input.notes : null,
        startDay,
        endDay,
      })
      .returning({ id: lifeChapters.id })
    if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create the chapter')
    if (goalIds.length)
      await tx.insert(lifeChapterGoals).values(goalIds.map((goalId) => ({ chapterId: created.id, goalId })))
    if (viewIds.length)
      await tx.insert(lifeViewChapters).values(viewIds.map((viewId) => ({ viewId, chapterId: created.id })))
    return created.id
  })
  return chapterOut(userId, id)
}

/** A field passed replaces; `goalIds` and `viewIds` replace the whole set. */
export async function updateChapter(userId: string, raw: unknown) {
  const input = updateLifeChapterSchema.parse(raw)
  const [current] = await db
    .select()
    .from(lifeChapters)
    .where(and(eq(lifeChapters.id, input.id), eq(lifeChapters.userId, userId)))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', 'Chapter not found')
  const startDay = input.startDay !== undefined ? input.startDay : current.startDay
  const endDay = input.endDay !== undefined ? input.endDay : current.endDay
  assertOrder(startDay, endDay)
  const goalIds = input.goalIds ? await assertGoals(userId, input.goalIds) : undefined
  const viewIds = input.viewIds ? await assertViews(userId, input.viewIds) : undefined

  await db.transaction(async (tx) => {
    await tx
      .update(lifeChapters)
      .set({
        title: input.title ?? current.title,
        emoji: input.emoji !== undefined ? input.emoji : current.emoji,
        color: input.color ?? current.color,
        notes: input.notes !== undefined ? (input.notes?.trim() ? input.notes : null) : current.notes,
        startDay,
        endDay,
      })
      .where(eq(lifeChapters.id, current.id))
    if (goalIds) {
      await tx.delete(lifeChapterGoals).where(eq(lifeChapterGoals.chapterId, current.id))
      if (goalIds.length) {
        await tx.insert(lifeChapterGoals).values(goalIds.map((goalId) => ({ chapterId: current.id, goalId })))
      }
    }
    if (viewIds) {
      await tx.delete(lifeViewChapters).where(eq(lifeViewChapters.chapterId, current.id))
      if (viewIds.length) {
        await tx.insert(lifeViewChapters).values(viewIds.map((viewId) => ({ viewId, chapterId: current.id })))
      }
    }
  })
  return chapterOut(userId, current.id)
}

export async function removeChapter(userId: string, id: string) {
  const deleted = await db
    .delete(lifeChapters)
    .where(and(eq(lifeChapters.id, id), eq(lifeChapters.userId, userId)))
    .returning({ id: lifeChapters.id })
  if (deleted.length === 0) throw new AppError('NOT_FOUND', 'Chapter not found')
  return { success: true }
}

async function viewOut(userId: string, id: string) {
  const view = (await viewsOf(userId)).find((v) => v.id === id)
  if (!view) throw new AppError('NOT_FOUND', 'View not found')
  return view
}

export async function createView(userId: string, raw: unknown) {
  const input = createLifeViewSchema.parse(raw)
  const chapterIds = await assertChapters(userId, input.chapterIds ?? [])
  const existing = await db.select({ id: lifeViews.id }).from(lifeViews).where(eq(lifeViews.userId, userId))
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(lifeViews)
      .values({ userId, name: input.name, emoji: input.emoji ?? null, orderIdx: existing.length })
      .returning({ id: lifeViews.id })
    if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create the view')
    if (chapterIds.length) {
      await tx.insert(lifeViewChapters).values(chapterIds.map((chapterId) => ({ viewId: created.id, chapterId })))
    }
    return created.id
  })
  return viewOut(userId, id)
}

export async function updateView(userId: string, raw: unknown) {
  const input = updateLifeViewSchema.parse(raw)
  const [current] = await db
    .select()
    .from(lifeViews)
    .where(and(eq(lifeViews.id, input.id), eq(lifeViews.userId, userId)))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', 'View not found')
  const chapterIds = input.chapterIds ? await assertChapters(userId, input.chapterIds) : undefined
  await db.transaction(async (tx) => {
    await tx
      .update(lifeViews)
      .set({
        name: input.name ?? current.name,
        emoji: input.emoji !== undefined ? input.emoji : current.emoji,
      })
      .where(eq(lifeViews.id, current.id))
    if (chapterIds) {
      await tx.delete(lifeViewChapters).where(eq(lifeViewChapters.viewId, current.id))
      if (chapterIds.length) {
        await tx.insert(lifeViewChapters).values(chapterIds.map((chapterId) => ({ viewId: current.id, chapterId })))
      }
    }
  })
  return viewOut(userId, current.id)
}

export async function removeView(userId: string, id: string) {
  const deleted = await db
    .delete(lifeViews)
    .where(and(eq(lifeViews.id, id), eq(lifeViews.userId, userId)))
    .returning({ id: lifeViews.id })
  if (deleted.length === 0) throw new AppError('NOT_FOUND', 'View not found')
  return { success: true }
}

/** Every view once, in the new order. */
export async function reorderViews(userId: string, raw: unknown) {
  const { ids } = reorderLifeViewsSchema.parse(raw)
  const views = await db.select({ id: lifeViews.id }).from(lifeViews).where(eq(lifeViews.userId, userId))
  const mine = new Set(views.map((v) => v.id))
  if (ids.length !== mine.size || new Set(ids).size !== ids.length || ids.some((id) => !mine.has(id))) {
    throw new AppError('BAD_REQUEST', 'Pass every view once')
  }
  await db.transaction(async (tx) => {
    for (const [orderIdx, id] of ids.entries()) {
      await tx.update(lifeViews).set({ orderIdx }).where(eq(lifeViews.id, id))
    }
  })
  return viewsOf(userId)
}

/**
 * One week of the user's life: the chapters it falls in, its journal days, its
 * sync notes and its pictures. `day` is any day of the week.
 */
export async function week(userId: string, raw: unknown) {
  const { day } = lifeWeekSchema.parse(raw)
  const sunday = sundayOf(day)
  const saturday = addDays(sunday, 6)
  const [s, chapters] = await Promise.all([settings(userId), chaptersOf(userId)])

  const inWeek = s.birthDate
    ? chapters.filter((c) => {
        const r = chapterRange(c, s.birthDate!, s.lifeExpectancyYears)
        return r.start <= saturday && r.end >= sunday
      })
    : []

  const entries = await db
    .select({
      id: journalEntries.id,
      day: journalEntries.day,
      highlights: journalEntries.highlights,
      content: journalEntries.content,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), gte(journalEntries.day, sunday), lte(journalEntries.day, saturday)))
    .orderBy(asc(journalEntries.day))
  const days = entries

  const at = weekOfDay(sunday)
  const syncs = await db
    .select({ id: weeklySync.id, weekDate: weeklySync.weekDate })
    .from(weeklySync)
    .where(
      and(
        eq(weeklySync.userId, userId),
        gte(weeklySync.weekDate, new Date(at.getTime() - WEEK_MATCH_MS)),
        lte(weeklySync.weekDate, new Date(at.getTime() + WEEK_MATCH_MS)),
      ),
    )
  const sync = syncs.find((x) => Math.abs(x.weekDate.getTime() - at.getTime()) <= WEEK_MATCH_MS) ?? null
  const items = sync
    ? await db
        .select({ id: weeklySyncItems.id, title: trackingItems.title, text: weeklySyncItems.textContent })
        .from(weeklySyncItems)
        .innerJoin(trackingItems, eq(trackingItems.id, weeklySyncItems.trackingItemId))
        .where(eq(weeklySyncItems.weeklySyncId, sync.id))
        .orderBy(asc(weeklySyncItems.orderIdx))
    : []

  const parents = [...items.map((i) => i.id), ...days.map((d) => d.id)]
  const files = parents.length
    ? await db
        .select({
          id: attachments.id,
          parentId: attachments.parentId,
          fileId: attachments.fileId,
          fileName: attachments.fileName,
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.userId, userId),
            eq(attachments.fileType, 'image'),
            inArray(attachments.parentId, parents),
          ),
        )
        .orderBy(asc(attachments.createdAt))
    : []
  const filesOf = (id: string) => files.filter((f) => f.parentId === id).length

  return {
    sunday,
    saturday,
    chapters: inWeek,
    journal: days.map((d) => ({ day: d.day, highlights: d.highlights, content: d.content, pictures: filesOf(d.id) })),
    sync: sync
      ? {
          id: sync.id,
          items: items
            .map((i) => ({ title: i.title, text: i.text, pictures: filesOf(i.id) }))
            .filter((i) => Boolean(i.text?.trim()) || i.pictures > 0),
        }
      : null,
    pictures: files.map((f) => ({ id: f.id, url: `/api/files/${f.fileId}`, fileName: f.fileName })),
  }
}
