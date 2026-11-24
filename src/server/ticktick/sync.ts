// The two-way sync with one TickTick list, as a reconciliation: every run reads
// both sides and the last agreed state of each linked item, and settles each
// field with a three-way merge (~/lib/ticktick). There is no outbox: an Anansi
// write only asks for a run soon (runner.ts), and whatever a failed run missed
// the next one sees, because the difference is still there.
//
// The shape:
//   goal  ↔ a top-level task in the list
//   task  ↔ a subtask of its goal's task (TickTick `parentId`)
//
// What syncs: title, description (TickTick `content`), completed, and the due
// day (an all-day date in the connection's zone). Mentions go out as plain
// `@Name` and are linked again when text comes back. Emoji, difficulty,
// referents, groups and TickTick's own fields (priority, tags, reminders,
// checklists) each stay on their side: an update sends TickTick its own task
// back with only our fields changed.
//
// Deletes: a task deleted (or whose goal is archived) in Anansi is deleted in
// TickTick. A task deleted in TickTick is completed in Anansi and its link
// rests as `gone`; a goal whose task was deleted in TickTick stays, unsynced.
// Either comes back if the TickTick task does (restored from the trash).
//
// Absence: the list's data holds undone tasks only, and recent completions are
// fetched separately. A linked task still missing after that is looked up ONCE
// and its state recorded; it is not looked up again until it shows up in the
// list and goes missing again.
import { AsyncLocalStorage } from 'node:async_hooks'
import { eq, inArray } from 'drizzle-orm'
import { createGoalSchema, createTaskSchema } from '~/lib/api/types'
import { db } from '~/lib/data'
import { goals, people, tasks, tickTickConnections, tickTickLinks, type TickTickSnapshot } from '~/lib/data/schema'
import { toEditable } from '~/lib/mentions'
import {
  dayInZone,
  dueFields,
  isDoneStatus,
  mergeFields,
  midnightInZone,
  remoteDueDay,
  toTickTickDate,
} from '~/lib/ticktick'
import * as goalsService from '~/server/services/goals'
import * as tasksService from '~/server/services/tasks'
import { openToken } from './crypto'
import { tickTick, TickTickAuthError, type RemoteTask, type TickTickClient } from './client'

/** Set while a sync runs, so its own writes do not ask for another sync. */
export const syncContext = new AsyncLocalStorage<true>()

export interface SyncReport {
  /** Changes sent to TickTick: creates, updates, completions, deletes. */
  toTickTick: number
  /** Changes made in Anansi: goals and tasks created or updated. */
  fromTickTick: number
  /** Items that failed this run; the next run tries them again. */
  errors: string[]
}

type Link = typeof tickTickLinks.$inferSelect
type GoalRow = { id: string; title: string; description: string; status: 'active' | 'archived'; x: number; y: number }
type TaskRow = typeof tasks.$inferSelect

const COMPLETED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const COMPLETED_OVERLAP_MS = 60 * 60 * 1000

const norm = (s: string) => s.trim().toLowerCase()
/** TickTick sends "" where it means nothing. */
const nonEmpty = (s: string | null | undefined) => (s === undefined || s === null || s === '' ? null : s)

/**
 * One run for one user. Answers null when there is nothing to sync with (no
 * connection, no list picked, or a sign-in TickTick refuses).
 */
export async function syncUser(userId: string): Promise<SyncReport | null> {
  const [conn] = await db.select().from(tickTickConnections).where(eq(tickTickConnections.userId, userId)).limit(1)
  if (!conn?.projectId || conn.needsReauth) return null
  const token = openToken(conn.accessToken)
  if (!token) {
    await db
      .update(tickTickConnections)
      .set({ needsReauth: true, lastError: 'The saved sign-in cannot be read. Connect TickTick again.' })
      .where(eq(tickTickConnections.id, conn.id))
    return null
  }

  const startedAt = new Date()
  try {
    const report = await reconcile(userId, tickTick(token), conn.projectId, conn.timeZone, conn.lastSyncedAt)
    if (report === 'list-gone') {
      await db
        .update(tickTickConnections)
        .set({ projectId: null, projectName: null, lastError: 'The TickTick list is gone. Pick another one.' })
        .where(eq(tickTickConnections.id, conn.id))
      await db.delete(tickTickLinks).where(eq(tickTickLinks.userId, userId))
      return null
    }
    await db
      .update(tickTickConnections)
      .set({ lastSyncedAt: startedAt, lastError: report.errors[0] ?? null })
      .where(eq(tickTickConnections.id, conn.id))
    return report
  } catch (e) {
    const auth = e instanceof TickTickAuthError
    await db
      .update(tickTickConnections)
      .set({ needsReauth: auth || undefined, lastError: e instanceof Error ? e.message : String(e) })
      .where(eq(tickTickConnections.id, conn.id))
    throw e
  }
}

async function reconcile(
  userId: string,
  tt: TickTickClient,
  projectId: string,
  zone: string,
  lastSyncedAt: Date | null,
): Promise<SyncReport | 'list-gone'> {
  const report: SyncReport = { toTickTick: 0, fromTickTick: 0, errors: [] }
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      if (e instanceof TickTickAuthError) throw e
      const message = `${what}: ${e instanceof Error ? e.message : String(e)}`
      console.error('[ticktick]', message)
      report.errors.push(message)
    }
  }

  // ── TickTick's side ───────────────────────────────────────────────────────
  const data = await tt.projectData(projectId)
  if (!data) return 'list-gone'
  const open = new Map((data.tasks ?? []).filter((t) => t.projectId === projectId).map((t) => [t.id, t]))
  const now = Date.now()
  const from = lastSyncedAt ? lastSyncedAt.getTime() - COMPLETED_OVERLAP_MS : now - COMPLETED_LOOKBACK_MS
  const completed = await tt.completedBetween(projectId, toTickTickDate(new Date(from)), toTickTickDate(new Date(now)))
  const done = new Map(completed.filter((t) => t.projectId === projectId).map((t) => [t.id, t]))

  // ── Anansi's side ─────────────────────────────────────────────────────────
  const goalRows: GoalRow[] = await db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      status: goals.status,
      x: goals.positionX,
      y: goals.positionY,
    })
    .from(goals)
    .where(eq(goals.userId, userId))
  const goalById = new Map(goalRows.map((g) => [g.id, g]))
  const isActive = (goalId: string) => goalById.get(goalId)?.status === 'active'
  const goalIds = goalRows.map((g) => g.id)
  const taskRows: TaskRow[] = goalIds.length ? await db.select().from(tasks).where(inArray(tasks.goalId, goalIds)) : []
  const taskById = new Map(taskRows.map((t) => [t.id, t]))
  const folks = await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.userId, userId))
  const plain = (text: string | null | undefined) => toEditable(text ?? '', folks)

  const links = await db.select().from(tickTickLinks).where(eq(tickTickLinks.userId, userId))
  const linkByLocal = new Map(links.map((l) => [`${l.kind}:${l.localId}`, l]))
  const linkByRemote = new Map(links.map((l) => [l.remoteId, l]))
  const remoteOf = new Map<string, RemoteTask>()

  const saveLink = async (link: Link, patch: Partial<Pick<Link, 'snapshot' | 'remoteState'>>) => {
    Object.assign(link, patch)
    await db.update(tickTickLinks).set(patch).where(eq(tickTickLinks.id, link.id))
  }
  const addLink = async (kind: 'goal' | 'task', localId: string, remoteId: string, snapshot: TickTickSnapshot) => {
    const [link] = await db
      .insert(tickTickLinks)
      .values({ userId, kind, localId, remoteId, snapshot, remoteState: snapshot.completed ? 'closed' : 'open' })
      .returning()
    if (!link) throw new Error('link not saved')
    linkByLocal.set(`${kind}:${localId}`, link)
    linkByRemote.set(remoteId, link)
    return link
  }
  const dropLink = async (link: Link) => {
    await db.delete(tickTickLinks).where(eq(tickTickLinks.id, link.id))
    linkByLocal.delete(`${link.kind}:${link.localId}`)
    linkByRemote.delete(link.remoteId)
  }

  // ── 1. Where each linked TickTick task is ────────────────────────────────
  // `newlyGone` holds the links that went missing in this run, the only ones
  // whose disappearance is acted on.
  const newlyGone = new Set<string>()
  for (const link of links) {
    const seen = open.get(link.remoteId) ?? done.get(link.remoteId)
    if (seen) {
      remoteOf.set(link.id, seen)
      const state = open.has(link.remoteId) ? 'open' : 'closed'
      if (link.remoteState !== state) await saveLink(link, { remoteState: state })
      continue
    }
    // Known to be closed or gone: no lookup until it shows up again.
    if (link.remoteState !== 'open') continue
    await attempt(`looking up a missing TickTick task`, async () => {
      const found = await tt.getTask(projectId, link.remoteId)
      if (found?.projectId === projectId && !found.deleted && isDoneStatus(found.status)) {
        remoteOf.set(link.id, found)
        await saveLink(link, { remoteState: 'closed' })
      } else {
        newlyGone.add(link.id)
        await saveLink(link, { remoteState: 'gone' })
      }
    })
  }

  // ── 2. New top-level TickTick tasks become goals ─────────────────────────
  // One with the title of a goal not yet linked is that goal.
  const unlinkedGoals = new Map(
    goalRows.filter((g) => g.status === 'active' && !linkByLocal.has(`goal:${g.id}`)).map((g) => [norm(g.title), g]),
  )
  let nextY = Math.max(0, ...goalRows.filter((g) => g.status === 'active').map((g) => g.y)) + 240
  const minX = Math.min(0, ...goalRows.filter((g) => g.status === 'active').map((g) => g.x))
  for (const r of open.values()) {
    if (r.parentId || linkByRemote.has(r.id)) continue
    await attempt(`importing "${r.title ?? ''}"`, async () => {
      const snapshot = { title: r.title ?? '', content: r.content ?? '' }
      const match = unlinkedGoals.get(norm(snapshot.title))
      if (match) {
        unlinkedGoals.delete(norm(snapshot.title))
        const link = await addLink('goal', match.id, r.id, snapshot)
        remoteOf.set(link.id, r)
        return
      }
      const created = await goalsService.create(
        userId,
        createGoalSchema.parse({
          title: snapshot.title || 'Untitled',
          description: snapshot.content,
          valueIds: [],
          tasks: [],
          position: { x: minX, y: nextY },
        }),
      )
      nextY += 240
      const row: GoalRow = {
        id: created.id,
        title: created.title,
        description: created.description,
        status: 'active',
        x: created.positionX,
        y: created.positionY,
      }
      goalRows.push(row)
      goalById.set(row.id, row)
      const link = await addLink('goal', created.id, r.id, { title: row.title, content: row.description })
      remoteOf.set(link.id, r)
      report.fromTickTick++
    })
  }

  // ── 3. Linked goals ───────────────────────────────────────────────────────
  const removedGoalLinks: Link[] = []
  for (const link of [...linkByLocal.values()].filter((l) => l.kind === 'goal')) {
    const goal = goalById.get(link.localId)
    if (goal?.status !== 'active') {
      removedGoalLinks.push(link) // after its tasks, below
      continue
    }
    if (link.remoteState === 'gone') continue
    await attempt(`syncing goal "${goal.title}"`, async () => {
      const r = remoteOf.get(link.id)
      const local = { title: goal.title, content: goal.description }
      const remote = r
        ? { title: r.title ?? '', content: r.content ?? '' }
        : { title: link.snapshot.title, content: link.snapshot.content }
      const { agreed, push, pull } = mergeFields(local, remote, link.snapshot)
      if (Object.keys(pull).length) {
        await goalsService.update(userId, { id: goal.id, title: pull.title, description: pull.content })
        if (pull.title !== undefined) goal.title = pull.title
        if (pull.content !== undefined) goal.description = pull.content
        report.fromTickTick++
      }
      if (Object.keys(push).length) {
        const base = r ?? (await tt.getTask(projectId, link.remoteId))
        if (base) {
          await tt.updateTask({ ...base, id: link.remoteId, projectId, ...push })
          report.toTickTick++
        }
      }
      await saveLink(link, { snapshot: agreed })
    })
  }

  // ── 4. Goals TickTick has not seen ────────────────────────────────────────
  for (const goal of goalRows) {
    if (goal.status !== 'active' || linkByLocal.has(`goal:${goal.id}`)) continue
    await attempt(`sending goal "${goal.title}"`, async () => {
      const snapshot = { title: goal.title, content: goal.description }
      const created = await tt.createTask({ projectId, ...snapshot })
      const link = await addLink('goal', goal.id, created.id, snapshot)
      remoteOf.set(link.id, created)
      report.toTickTick++
    })
  }

  const parentFor = (goalId: string) => {
    const link = linkByLocal.get(`goal:${goalId}`)
    return link && link.remoteState !== 'gone' ? link.remoteId : null
  }
  const localTaskFields = (t: TaskRow) => ({
    title: plain(t.title),
    content: plain(t.description),
    completed: t.completed,
    due: t.scheduledAt ? dayInZone(t.scheduledAt, zone) : null,
    parent: parentFor(t.goalId),
  })

  // ── 5. Linked tasks ───────────────────────────────────────────────────────
  for (const link of [...linkByLocal.values()].filter((l) => l.kind === 'task')) {
    const task = taskById.get(link.localId)
    if (!task || !isActive(task.goalId)) {
      await attempt('deleting a task in TickTick', async () => {
        if (link.remoteState !== 'gone') {
          await tt.deleteTask(projectId, link.remoteId)
          report.toTickTick++
        }
        await dropLink(link)
      })
      continue
    }
    if (link.remoteState === 'gone') {
      if (newlyGone.has(link.id) && !task.completed) {
        await attempt(`completing "${plain(task.title)}"`, async () => {
          await tasksService.update(userId, { id: task.id, goalId: task.goalId, completed: true })
          await saveLink(link, { snapshot: { ...link.snapshot, completed: true } })
          report.fromTickTick++
        })
      }
      continue
    }
    await attempt(`syncing task "${plain(task.title)}"`, async () => {
      const r = remoteOf.get(link.id)
      const local = localTaskFields(task)
      const s = link.snapshot
      const remote = r
        ? {
            title: r.title ?? '',
            content: r.content ?? '',
            completed: isDoneStatus(r.status),
            due: remoteDueDay(r, zone),
            parent: nonEmpty(r.parentId),
          }
        : {
            title: s.title,
            content: s.content,
            completed: s.completed ?? false,
            due: s.due ?? null,
            parent: s.parent ?? null,
          }
      // A goal whose TickTick task is gone has no parent to offer; its tasks keep
      // whatever TickTick says rather than being moved to the top level.
      local.parent ??= remote.parent
      const { agreed, push, pull } = mergeFields(local, remote, s)

      // A move in TickTick under another linked goal moves the task; a move
      // anywhere else is undone.
      if (pull.parent !== undefined) {
        const goalLink = pull.parent ? linkByRemote.get(pull.parent) : undefined
        if (goalLink?.kind === 'goal' && goalLink.remoteState !== 'gone' && isActive(goalLink.localId)) {
          await db.update(tasks).set({ goalId: goalLink.localId, updatedAt: new Date() }).where(eq(tasks.id, task.id))
          task.goalId = goalLink.localId
          report.fromTickTick++
        } else {
          push.parent = local.parent
          agreed.parent = local.parent
        }
        delete pull.parent
      }

      if (Object.keys(pull).length) {
        await tasksService.update(userId, {
          id: task.id,
          goalId: task.goalId,
          ...(pull.title !== undefined ? { title: pull.title } : {}),
          ...(pull.content !== undefined ? { description: pull.content || null } : {}),
          ...(pull.completed !== undefined ? { completed: pull.completed } : {}),
          ...(pull.due !== undefined ? { scheduledAt: pull.due ? midnightInZone(pull.due, zone) : null } : {}),
        })
        report.fromTickTick++
      }

      const { completed: pushCompleted, ...fieldPush } = push
      const fieldsChanged = Object.keys(fieldPush).length > 0 || pushCompleted === false
      if (fieldsChanged) {
        const base = r ?? (await tt.getTask(projectId, link.remoteId))
        if (base) {
          await tt.updateTask({
            ...base,
            id: link.remoteId,
            projectId,
            ...(fieldPush.title !== undefined ? { title: fieldPush.title } : {}),
            ...(fieldPush.content !== undefined ? { content: fieldPush.content } : {}),
            ...(fieldPush.due !== undefined ? dueFields(fieldPush.due, zone) : {}),
            ...(fieldPush.parent !== undefined ? { parentId: fieldPush.parent ?? '' } : {}),
            ...(pushCompleted === false ? { status: 0, completedTime: null } : {}),
          })
          report.toTickTick++
        }
      }
      if (pushCompleted === true) {
        await tt.completeTask(projectId, link.remoteId)
        report.toTickTick++
      }
      await saveLink(link, { snapshot: agreed, remoteState: agreed.completed ? 'closed' : 'open' })
    })
  }

  // ── 6. Tasks TickTick has not seen ────────────────────────────────────────
  // Open ones only: a connect does not fill the list with old finished work.
  for (const task of taskRows) {
    if (task.completed || !isActive(task.goalId) || linkByLocal.has(`task:${task.id}`)) continue
    const parent = parentFor(task.goalId)
    if (!parent) continue
    await attempt(`sending task "${plain(task.title)}"`, async () => {
      const fields = localTaskFields(task)
      const created = await tt.createTask({
        projectId,
        title: fields.title,
        content: fields.content,
        parentId: parent,
        ...dueFields(fields.due, zone),
      })
      // The create documentation does not list `parentId`; if it was not
      // taken, set it the documented way.
      if (created.parentId !== parent) await tt.updateTask({ ...created, id: created.id, projectId, parentId: parent })
      await addLink('task', task.id, created.id, fields)
      report.toTickTick++
    })
  }

  // ── 7. New TickTick subtasks become tasks ─────────────────────────────────
  for (const r of open.values()) {
    if (!r.parentId || linkByRemote.has(r.id)) continue
    const goalLink = linkByRemote.get(r.parentId)
    if (goalLink?.kind !== 'goal' || goalLink.remoteState === 'gone' || !isActive(goalLink.localId)) continue
    await attempt(`importing task "${r.title ?? ''}"`, async () => {
      const due = remoteDueDay(r, zone)
      const created = await tasksService.create(userId, {
        ...createTaskSchema.parse({
          title: r.title?.trim() ? r.title : 'Untitled',
          description: nonEmpty(r.content),
          difficulty: 2,
          completed: false,
          scheduledAt: due ? midnightInZone(due, zone) : null,
        }),
        goalId: goalLink.localId,
      })
      await addLink('task', created.id, r.id, {
        title: plain(created.title),
        content: plain(created.description),
        completed: false,
        due,
        parent: r.parentId ?? null,
      })
      report.fromTickTick++
    })
  }

  // ── 8. Goals removed in Anansi, after their tasks ─────────────────────────
  for (const link of removedGoalLinks) {
    await attempt('deleting a goal in TickTick', async () => {
      if (link.remoteState !== 'gone') {
        await tt.deleteTask(projectId, link.remoteId)
        report.toTickTick++
      }
      await dropLink(link)
    })
  }

  return report
}

/** Drops every link of a user (a new list, or a disconnect). */
export async function forgetLinks(userId: string) {
  await db.delete(tickTickLinks).where(eq(tickTickLinks.userId, userId))
}
