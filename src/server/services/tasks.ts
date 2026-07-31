// Task CRUD. Tasks have no user_id — ownership is inherited from the parent
// goal, so every entry point here goes through assertOwnsGoal (or an explicit
// join back to goals) before touching a row.
import { and, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { goals, taskReferents, tasks, tasksToGroups } from '~/lib/data/schema'
import type { CreateTask, UpdateTask } from '~/lib/api/types'
import { AppError } from './errors'
import { assertOwnsGoal } from './goals'

export async function create(userId: string, input: CreateTask & { goalId: string }) {
  await assertOwnsGoal(userId, input.goalId)

  const { referentIds, groupIds, ...taskInput } = input
  const [created] = await db.insert(tasks).values(taskInput).returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create task')

  if (referentIds?.length) {
    await db.insert(taskReferents).values(referentIds.map((personId) => ({ taskId: created.id, personId })))
  }
  if (groupIds?.length) {
    await db.insert(tasksToGroups).values(groupIds.map((groupId) => ({ taskId: created.id, groupId })))
  }
  return created
}

/**
 * `referentIds` and `groupIds` are replace-set semantics: pass an array to
 * replace the whole set, omit the key entirely to leave it untouched. Passing
 * `[]` therefore clears it — that distinction is load-bearing for the modals,
 * which omit the key when the user didn't open the picker.
 */
export async function update(userId: string, input: UpdateTask & { goalId: string }) {
  const { id, goalId, referentIds, groupIds, ...updateData } = input
  await assertOwnsGoal(userId, goalId)

  const [updated] = await db
    .update(tasks)
    // updatedAt restated — see services/connections.ts update.
    .set({ ...updateData, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.goalId, goalId)))
    .returning()

  if (referentIds !== undefined) {
    await db.delete(taskReferents).where(eq(taskReferents.taskId, id))
    if (referentIds.length > 0) {
      await db.insert(taskReferents).values(referentIds.map((personId) => ({ taskId: id, personId })))
    }
  }
  if (groupIds !== undefined) {
    await db.delete(tasksToGroups).where(eq(tasksToGroups.taskId, id))
    if (groupIds.length > 0) {
      await db.insert(tasksToGroups).values(groupIds.map((groupId) => ({ taskId: id, groupId })))
    }
  }
  return updated
}

export async function remove(userId: string, input: { id: string; goalId: string }) {
  await assertOwnsGoal(userId, input.goalId)
  await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.goalId, input.goalId)))
  return { success: true }
}

/**
 * Drag-drop endpoint for the Horizons board. Persists only the date — which
 * bucket the task lands in (month/quarter/year/…) is computed at render time
 * from this date and the current calendar, so a task auto-promotes as its
 * deadline approaches without anyone touching the row. See horizon-period.ts.
 *
 * Ownership goes through a join rather than assertOwnsGoal because the caller
 * only knows the task id here.
 */
export async function setScheduled(userId: string, input: { id: string; scheduledAt: Date | null }) {
  const [owned] = await db
    .select({ taskId: tasks.id })
    .from(tasks)
    .innerJoin(goals, eq(tasks.goalId, goals.id))
    .where(and(eq(tasks.id, input.id), eq(goals.userId, userId)))
    .limit(1)
  if (!owned) throw new AppError('NOT_FOUND', 'Task not found or access denied')

  await db.update(tasks).set({ scheduledAt: input.scheduledAt }).where(eq(tasks.id, input.id))
  return { success: true }
}
