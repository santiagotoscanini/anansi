// The two-way sync with one TickTick list, as a reconciliation: every run reads
// both sides and the last agreed state of each linked task, and settles each
// field with a three-way merge (~/lib/ticktick). There is no outbox: an Anansi
// write only asks for a run soon (runner.ts), and whatever a failed run missed
// the next one sees, because the difference is still there.
//
// The shape: each Anansi task is a top-level task in the list.
//   title    `{emoji} {title}`, the emoji being the task's own or its goal's
//   tag      the goal's title (lowercased, as TickTick keeps tags); changing
//            it to another goal's tag in TickTick moves the task to that goal
//   section  the Horizons column its due day puts it in, named and ordered as
//            there (Backlog, Past due, November 2026, Q4 2026, 2026, Later;
//            renamed as the calendar turns). Moving it to another section in
//            TickTick dates it the way a drop on Horizons does.
// Goals are not TickTick tasks. Until November 2026 they were, with their
// tasks as subtasks; a run detaches those subtasks and deletes the old goal
// tasks (the `kind = 'goal'` links).
//
// What else syncs: notes (TickTick `content`), completion, and the due day (an
// all-day date in the connection's zone). Mentions go out as plain `@Name` and
// are linked again when text comes back. Difficulty, referents and groups stay
// in Anansi; TickTick's priority, reminders, checklists and other tags stay
// there: an update sends only the fields it changes.
//
// Deletes: a task deleted in Anansi, or whose goal is archived, is deleted in
// TickTick. A task deleted in TickTick is completed in Anansi and its link
// rests as `gone`; it comes back if the TickTick task does (restored from the
// trash).
//
// Absence: the list's data holds undone tasks only, and recent completions are
// fetched separately. A linked task still missing after that is looked up ONCE
// and its state recorded; it is not looked up again until it shows up in the
// list and goes missing again.
import { AsyncLocalStorage } from 'node:async_hooks'
import { eq, inArray } from 'drizzle-orm'
import { createTaskSchema } from '~/lib/api/types'
import { db } from '~/lib/data'
import { goals, people, tasks, tickTickConnections, tickTickLinks, type TickTickSnapshot } from '~/lib/data/schema'
import { isEmojiGlyph, isEmojiUrl } from '~/lib/emoji-utils'
import { toEditable } from '~/lib/mentions'
import {
  composeTitle,
  dayInZone,
  dueFields,
  dueForSection,
  isDoneStatus,
  leadingEmoji,
  mergeFields,
  midnightInZone,
  remoteDueDay,
  isSectionName,
  SECTIONS,
  sectionName,
  sectionOf,
  stripEmoji,
  taskDay,
  toTickTickDate,
  type SectionKey,
} from '~/lib/ticktick'
import * as tasksService from '~/server/services/tasks'
import { openToken } from './crypto'
import { tickTick, TickTickAuthError, type RemoteTask, type TickTickClient } from './client'

/** Set while a sync runs, so its own writes do not ask for another sync. */
export const syncContext = new AsyncLocalStorage<true>()

export interface SyncReport {
  /** Changes sent to TickTick: creates, updates, completions, deletes. */
  toTickTick: number
  /** Changes made in Anansi: tasks created or updated. */
  fromTickTick: number
  /** Items that failed this run; the next run tries them again. */
  errors: string[]
}

type Link = typeof tickTickLinks.$inferSelect
type GoalRow = { id: string; title: string; emoji: string | null; status: 'active' | 'archived' }
type TaskRow = typeof tasks.$inferSelect
type Fields = { title: string; content: string; completed: boolean; due: string | null; goal: string | null }

const COMPLETED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const COMPLETED_OVERLAP_MS = 60 * 60 * 1000

const norm = (s: string) => s.trim().toLowerCase()
/** TickTick sends "" where it means nothing. */
const nonEmpty = (s: string | null | undefined) => (s === undefined || s === null || s === '' ? null : s)
/** A goal's tag: TickTick lowercases tags, so this is how it comes back. */
const tagOf = (goal: { title: string }) => norm(goal.title)
/** An emoji that can go in a title: a glyph, not an uploaded picture. */
const glyph = (emoji: string | null | undefined) => (emoji && !isEmojiUrl(emoji) && isEmojiGlyph(emoji) ? emoji : null)

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
  if (!data) {
    // One 404 is not enough to forget every link: only a list that is really
    // not among the user's lists any more is gone.
    const lists = await tt.listProjects()
    if (!lists.some((p) => p.id === projectId)) return 'list-gone'
    throw new Error('TickTick did not answer for the list; trying again on the next run')
  }
  const open = new Map((data.tasks ?? []).filter((t) => t.projectId === projectId).map((t) => [t.id, t]))
  const now = Date.now()
  const from = lastSyncedAt ? lastSyncedAt.getTime() - COMPLETED_OVERLAP_MS : now - COMPLETED_LOOKBACK_MS
  const completed = await tt.completedBetween(projectId, toTickTickDate(new Date(from)), toTickTickDate(new Date(now)))
  const done = new Map(completed.filter((t) => t.projectId === projectId).map((t) => [t.id, t]))
  const today = dayInZone(new Date(now), zone)

  // The sections: found by the shape of their name ("November 2026" is the
  // month section in December too), renamed and reordered to Horizons', and
  // made when missing. A section renamed to something else is made again.
  // Past due and Later are made only when a task lands in them, as Horizons
  // shows those columns only then (TickTick cannot delete a section, so an
  // emptied one stays until deleted by hand).
  const columns = [...(data.columns ?? [])]
  const sectionId = new Map<SectionKey, string>()
  const sectionKeyOf = new Map<string, SectionKey>()
  const taken = new Set<string>()
  const makeSection = async (key: SectionKey) => {
    const s = SECTIONS.find((x) => x.key === key)
    if (!s) return undefined
    const name = sectionName(key, today)
    const made = await tt.createColumn(projectId, name, s.order)
    columns.push(made)
    taken.add(made.id)
    sectionId.set(key, made.id)
    sectionKeyOf.set(made.id, key)
    report.toTickTick++
    return made.id
  }
  for (const s of SECTIONS) {
    const name = sectionName(s.key, today)
    const free = columns.filter((c) => !taken.has(c.id))
    const found = free.find((c) => norm(c.name) === norm(name)) ?? free.find((c) => isSectionName(s.key, c.name))
    if (found) {
      taken.add(found.id)
      sectionId.set(s.key, found.id)
      sectionKeyOf.set(found.id, s.key)
      if (found.name === name && found.sortOrder === s.order) continue
      await attempt(`renaming the "${found.name}" section`, async () => {
        await tt.updateColumn(projectId, found.id, { name, sortOrder: s.order })
        report.toTickTick++
      })
      continue
    }
    if (s.key === 'past' || s.key === 'later') continue
    await attempt(`making the "${name}" section`, async () => {
      await makeSection(s.key)
    })
  }

  // ── Anansi's side ─────────────────────────────────────────────────────────
  const goalRows: GoalRow[] = await db
    .select({ id: goals.id, title: goals.title, emoji: goals.emoji, status: goals.status })
    .from(goals)
    .where(eq(goals.userId, userId))
  const goalById = new Map(goalRows.map((g) => [g.id, g]))
  const isActive = (goalId: string) => goalById.get(goalId)?.status === 'active'
  const activeGoals = goalRows.filter((g) => g.status === 'active')
  const goalByTag = new Map(activeGoals.map((g) => [tagOf(g), g]))
  const goalTags = new Set(goalByTag.keys())
  const goalIds = goalRows.map((g) => g.id)
  const taskRows: TaskRow[] = goalIds.length ? await db.select().from(tasks).where(inArray(tasks.goalId, goalIds)) : []
  const taskById = new Map(taskRows.map((t) => [t.id, t]))
  const folks = await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.userId, userId))
  const plain = (text: string | null | undefined) => toEditable(text ?? '', folks)

  const links = await db.select().from(tickTickLinks).where(eq(tickTickLinks.userId, userId))
  const taskLinks = links.filter((l) => l.kind === 'task')
  const legacyGoalLinks = links.filter((l) => l.kind === 'goal')
  const linkByLocal = new Map(taskLinks.map((l) => [l.localId, l]))
  const linkByRemote = new Map(links.map((l) => [l.remoteId, l]))
  const legacyGoalOf = new Map(legacyGoalLinks.map((l) => [l.remoteId, l.localId]))

  const saveLink = async (link: Link, patch: Partial<Pick<Link, 'snapshot' | 'remoteState'>>) => {
    Object.assign(link, patch)
    await db.update(tickTickLinks).set(patch).where(eq(tickTickLinks.id, link.id))
  }
  const addLink = async (localId: string, remoteId: string, snapshot: TickTickSnapshot) => {
    const [link] = await db
      .insert(tickTickLinks)
      .values({
        userId,
        kind: 'task',
        localId,
        remoteId,
        snapshot,
        remoteState: snapshot.completed ? 'closed' : 'open',
      })
      .returning()
    if (!link) throw new Error('link not saved')
    linkByLocal.set(localId, link)
    linkByRemote.set(remoteId, link)
    return link
  }
  const dropLink = async (link: Link) => {
    await db.delete(tickTickLinks).where(eq(tickTickLinks.id, link.id))
    linkByLocal.delete(link.localId)
    linkByRemote.delete(link.remoteId)
  }

  const localFields = (t: TaskRow): Fields => {
    const goal = goalById.get(t.goalId)
    return {
      title: composeTitle(glyph(t.emoji) ?? glyph(goal?.emoji), plain(t.title)),
      content: plain(t.description),
      completed: t.completed,
      due: taskDay(t.scheduledAt, zone),
      goal: goal ? tagOf(goal) : null,
    }
  }
  /** The goal tag a TickTick task carries: a new one the user added wins over the agreed one. */
  const remoteGoal = (r: RemoteTask, agreed: string | null | undefined) => {
    const carried = (r.tags ?? []).map(norm).filter((t) => goalTags.has(t))
    return carried.find((t) => t !== agreed) ?? carried[0] ?? null
  }
  /** Tags to send: the task's other tags kept, goal tags replaced by `goal`'s. */
  const tagsWith = (r: RemoteTask | undefined, goal: string | null, previous: string | null | undefined) => [
    ...(r?.tags ?? []).filter((t) => !goalTags.has(norm(t)) && norm(t) !== previous),
    ...(goal ? [goal] : []),
  ]
  /** The section an open task belongs in, made if it is a Past due or Later not there yet. */
  const sectionFor = async (f: Fields): Promise<string | undefined> => {
    if (f.completed) return undefined
    const key = sectionOf(f.due, today)
    return sectionId.get(key) ?? (await makeSection(key))
  }

  // ── 1. Where each linked TickTick task is ────────────────────────────────
  // `remoteOf` holds an open task as TickTick has it. A closed one has only its
  // completion to say (the completed list leaves out due dates), so it merges
  // against the snapshot with `completed` set. `newlyGone` holds the links that
  // went missing in this run, the only ones whose disappearance is acted on.
  const remoteOf = new Map<string, RemoteTask>()
  const closedNow = new Set<string>()
  const newlyGone = new Set<string>()
  for (const link of taskLinks) {
    const openTask = open.get(link.remoteId)
    if (openTask) {
      remoteOf.set(link.id, openTask)
      if (link.remoteState !== 'open') await saveLink(link, { remoteState: 'open' })
      continue
    }
    if (done.has(link.remoteId)) {
      closedNow.add(link.id)
      if (link.remoteState !== 'closed') await saveLink(link, { remoteState: 'closed' })
      continue
    }
    // Known to be closed or gone: no lookup until it shows up again.
    if (link.remoteState !== 'open') continue
    await attempt('looking up a missing TickTick task', async () => {
      const found = await tt.getTask(projectId, link.remoteId)
      const here = found?.projectId === projectId && !found.deleted
      if (here && isDoneStatus(found.status)) {
        closedNow.add(link.id)
        await saveLink(link, { remoteState: 'closed' })
      } else {
        // Not found, moved out of the list, or in the trash: a trashed task is
        // still answered by id, as open and unflagged (seen November 2026), and
        // its absence from the list's undone tasks is the only sign of it.
        newlyGone.add(link.id)
        await saveLink(link, { remoteState: 'gone' })
      }
    })
  }

  // ── 2. Tasks deleted in Anansi, or whose goal was archived ───────────────
  for (const link of taskLinks) {
    const task = taskById.get(link.localId)
    if (task && isActive(task.goalId)) continue
    await attempt('deleting a task in TickTick', async () => {
      if (link.remoteState !== 'gone') {
        await tt.deleteTask(projectId, link.remoteId)
        report.toTickTick++
      }
      await dropLink(link)
    })
  }

  // ── 3. TickTick tasks not linked yet ─────────────────────────────────────
  // Ours when they carry a goal's tag, sit under an old goal task, or start
  // with exactly one goal's emoji; anything else in the list is left alone.
  // A task matching an unlinked open Anansi task of that goal by title is that
  // task (so connecting twice does not double anything); otherwise it is new.
  const goalByEmoji = new Map<string, GoalRow | null>()
  for (const g of activeGoals) {
    const e = glyph(g.emoji)
    if (e) goalByEmoji.set(e, goalByEmoji.has(e) ? null : g)
  }
  const unlinkedLocal = new Map<string, TaskRow[]>()
  for (const t of taskRows) {
    if (t.completed || !isActive(t.goalId) || linkByLocal.has(t.id)) continue
    const key = `${t.goalId}:${norm(plain(t.title))}`
    unlinkedLocal.set(key, [...(unlinkedLocal.get(key) ?? []), t])
  }
  for (const r of open.values()) {
    if (linkByRemote.has(r.id)) continue
    const parent = nonEmpty(r.parentId)
    const fromLegacy = parent ? legacyGoalOf.get(parent) : undefined
    if (parent && !fromLegacy) continue // someone's subtask: it goes where its parent goes
    const tag = remoteGoal(r, null)
    const emoji = leadingEmoji(r.title ?? '')
    const goal =
      (tag ? goalByTag.get(tag) : undefined) ??
      (fromLegacy && isActive(fromLegacy) ? goalById.get(fromLegacy) : undefined) ??
      (emoji ? goalByEmoji.get(emoji) : undefined) ??
      undefined
    if (!goal) continue
    await attempt(`importing "${r.title ?? ''}"`, async () => {
      const text = stripEmoji(r.title ?? '').trim()
      const remote: Fields = {
        title: r.title ?? '',
        content: r.content ?? '',
        completed: false,
        due: remoteDueDay(r, zone) ?? dueOfSection(r),
        goal: tag,
      }
      const match = unlinkedLocal.get(`${goal.id}:${norm(text)}`)?.shift()
      if (match) {
        // Each field starts from the side that has something, so neither
        // side's notes or date are wiped by the other's blank.
        const local = localFields(match)
        const base: TickTickSnapshot = {
          title: remote.title,
          content: local.content ? remote.content : local.content,
          completed: false,
          due: local.due ? remote.due : local.due,
          goal: remote.goal,
          section: r.columnId ? (sectionKeyOf.get(r.columnId) ?? null) : null,
        }
        const link = await addLink(match.id, r.id, base)
        remoteOf.set(link.id, r)
        taskLinks.push(link)
        return
      }
      const created = await tasksService.create(userId, {
        ...createTaskSchema.parse({
          title: text || 'Untitled',
          description: nonEmpty(r.content),
          difficulty: 2,
          completed: false,
          scheduledAt: remote.due ? midnightInZone(remote.due, zone) : null,
        }),
        goalId: goal.id,
      })
      const row: TaskRow = { ...created }
      taskRows.push(row)
      taskById.set(row.id, row)
      // The snapshot is TickTick's side, so what Anansi adds (the emoji, the
      // goal's tag, the section) goes out below.
      const link = await addLink(created.id, r.id, {
        ...remote,
        // The date as TickTick has it: one taken from the section goes out below.
        due: remoteDueDay(r, zone),
        section: r.columnId ? (sectionKeyOf.get(r.columnId) ?? null) : null,
      })
      remoteOf.set(link.id, r)
      taskLinks.push(link)
      report.fromTickTick++
    })
  }

  /** The due day a task's section says, for a task with no date of its own. */
  function dueOfSection(r: RemoteTask): string | null {
    const key = r.columnId ? sectionKeyOf.get(r.columnId) : undefined
    return key ? (dueForSection(key, today) ?? null) : null
  }

  // ── 4. Linked tasks ───────────────────────────────────────────────────────
  const detached = new Set<string>()
  for (const link of taskLinks) {
    const task = taskById.get(link.localId)
    if (!task || !isActive(task.goalId) || !linkByLocal.has(task.id)) continue
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
    await attempt(`syncing "${plain(task.title)}"`, async () => {
      const r = remoteOf.get(link.id)
      const s = link.snapshot
      const local = localFields(task)
      const remote: Fields = r
        ? {
            title: r.title ?? '',
            content: r.content ?? '',
            completed: isDoneStatus(r.status),
            due: remoteDueDay(r, zone),
            goal: remoteGoal(r, s.goal) ?? s.goal ?? null,
          }
        : {
            title: s.title,
            content: s.content,
            completed: closedNow.has(link.id) || (s.completed ?? false),
            due: s.due ?? null,
            goal: s.goal ?? null,
          }

      // A move to another section in TickTick is a new date, when the date
      // itself did not change there. Past due and Later cannot be moved into.
      const movedTo = r?.columnId ? sectionKeyOf.get(r.columnId) : undefined
      let bounceSection = false
      if (r && movedTo && s.section && movedTo !== s.section && remote.due === (s.due ?? null)) {
        const due = dueForSection(movedTo, today)
        if (due === undefined) bounceSection = true
        else remote.due = due
      }

      const { agreed, push, pull } = mergeFields(local, remote, s)

      // A goal tag changed in TickTick moves the task; a tag that names no
      // goal is not a move (the task keeps its goal and gets its tag back).
      if (pull.goal !== undefined) {
        const target = pull.goal ? goalByTag.get(pull.goal) : undefined
        if (target && target.id !== task.goalId) {
          await db.update(tasks).set({ goalId: target.id, updatedAt: new Date() }).where(eq(tasks.id, task.id))
          task.goalId = target.id
          report.fromTickTick++
          // Its name starts with the new goal's emoji now.
          const renamed = localFields(task).title
          if (renamed !== agreed.title) {
            push.title = renamed
            agreed.title = renamed
          }
        } else {
          push.goal = local.goal
          agreed.goal = local.goal
        }
        delete pull.goal
      }

      // A date that came from a section move (or that TickTick otherwise lacks)
      // is written there too, or the next run would read its absence as a
      // date cleared in TickTick.
      if (r && push.due === undefined && agreed.due !== remoteDueDay(r, zone)) push.due = agreed.due

      if (Object.keys(pull).length) {
        await tasksService.update(userId, {
          id: task.id,
          goalId: task.goalId,
          ...(pull.title !== undefined ? { title: stripEmoji(pull.title).trim() || plain(task.title) } : {}),
          ...(pull.content !== undefined ? { description: pull.content || null } : {}),
          ...(pull.completed !== undefined ? { completed: pull.completed } : {}),
          ...(pull.due !== undefined ? { scheduledAt: pull.due ? midnightInZone(pull.due, zone) : null } : {}),
        })
        if (pull.completed !== undefined) task.completed = pull.completed
        report.fromTickTick++
      }

      // What TickTick must be told. Only what changes is sent: an update keeps
      // every field it does not name.
      const wantSection = await sectionFor(agreed)
      const { completed: pushCompleted, ...fields } = push
      const update: Partial<RemoteTask> = {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.content !== undefined ? { content: fields.content } : {}),
        ...(fields.due !== undefined ? dueFields(fields.due, zone) : {}),
        ...(fields.goal !== undefined ? { tags: tagsWith(r, fields.goal, s.goal) } : {}),
        ...(pushCompleted === false ? { status: 0 } : {}),
        // A subtask of an old goal task is lifted to the top of the list.
        ...(r && nonEmpty(r.parentId) ? { parentId: '' } : {}),
        // The section follows the date, and time moves dates between sections.
        ...(r && wantSection && (r.columnId !== wantSection || bounceSection) ? { columnId: wantSection } : {}),
        ...(!r && pushCompleted === false && wantSection ? { columnId: wantSection } : {}),
      }
      if (Object.keys(update).length) {
        await tt.updateTask({ id: link.remoteId, projectId, ...update })
        if (update.parentId === '') detached.add(link.remoteId)
        report.toTickTick++
      }
      let snapshot: TickTickSnapshot = {
        ...agreed,
        section: wantSection ? (sectionKeyOf.get(wantSection) ?? null) : (s.section ?? null),
      }
      if (pushCompleted === true) {
        await tt.completeTask(projectId, link.remoteId)
        report.toTickTick++
        // A repeating task stays open with its next date: that is the task now.
        if (r?.repeatFlag) {
          const next = await tt.getTask(projectId, link.remoteId)
          if (next && !isDoneStatus(next.status)) {
            const due = remoteDueDay(next, zone)
            await tasksService.update(userId, {
              id: task.id,
              goalId: task.goalId,
              completed: false,
              scheduledAt: due ? midnightInZone(due, zone) : null,
            })
            snapshot = { ...snapshot, completed: false, due }
          }
        }
      }
      await saveLink(link, { snapshot, remoteState: snapshot.completed ? 'closed' : 'open' })
    })
  }

  // ── 5. Tasks TickTick has not seen ────────────────────────────────────────
  // Open ones only: a connect does not fill the list with old finished work.
  for (const task of taskRows) {
    if (task.completed || !isActive(task.goalId) || linkByLocal.has(task.id)) continue
    await attempt(`sending "${plain(task.title)}"`, async () => {
      const fields = localFields(task)
      const section = await sectionFor(fields)
      const created = await tt.createTask({
        projectId,
        title: fields.title,
        content: fields.content,
        tags: fields.goal ? [fields.goal] : [],
        ...(section ? { columnId: section } : {}),
        ...dueFields(fields.due, zone),
      })
      await addLink(task.id, created.id, {
        ...fields,
        section: section ? (sectionKeyOf.get(section) ?? null) : null,
      })
      report.toTickTick++
    })
  }

  // ── 6. The old goal tasks ─────────────────────────────────────────────────
  // Each is deleted once nothing hangs under it: TickTick deletes subtasks
  // with their parent, so any left (open or completed, linked or not) are
  // lifted to the top of the list first.
  for (const link of legacyGoalLinks) {
    await attempt('removing an old goal task from TickTick', async () => {
      const children = [...open.values(), ...done.values()].filter(
        (t) => nonEmpty(t.parentId) === link.remoteId && !detached.has(t.id),
      )
      for (const child of children) {
        await tt.updateTask({ id: child.id, projectId, parentId: '' })
        report.toTickTick++
      }
      if (link.remoteState !== 'gone') {
        await tt.deleteTask(projectId, link.remoteId)
        report.toTickTick++
      }
      await db.delete(tickTickLinks).where(eq(tickTickLinks.id, link.id))
    })
  }

  return report
}

/** Drops every link of a user (a new list, or a disconnect). */
export async function forgetLinks(userId: string) {
  await db.delete(tickTickLinks).where(eq(tickTickLinks.userId, userId))
}
