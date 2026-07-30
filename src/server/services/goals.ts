// Goal CRUD plus the shared ownership guard the task and connection services
// also rely on.
import { and, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { connections, goalValues, goals, taskReferents, tasks, tasksToGroups, trackingItems } from '~/lib/data/schema'
import { loadGoalsForUser } from '~/lib/data/queries/load-goals'
import type { CreateGoal, Goal, UpdateGoal } from '~/lib/api/types'
import { AppError } from './errors'

/**
 * Throws NOT_FOUND unless the goal exists and belongs to the user.
 *
 * Deliberately NOT_FOUND rather than FORBIDDEN: a caller must not be able to
 * tell "someone else's goal" from "no such goal". Shared by tasks and
 * connections, which have no user_id of their own and inherit ownership from
 * the goal.
 */
export async function assertOwnsGoal(userId: string, goalId: string) {
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Goal not found or access denied')
}

export async function list(userId: string): Promise<Goal[]> {
  const { goals: rows } = await loadGoalsForUser(userId)
  return rows
}

export async function create(userId: string, input: CreateGoal) {
  const { valueIds, tasks: inputTasks, position, ...goalData } = input

  const [created] = await db
    .insert(goals)
    .values({ ...goalData, userId, positionX: position.x, positionY: position.y })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create goal')

  if (valueIds.length > 0) {
    await db.insert(goalValues).values(valueIds.map((valueId) => ({ goalId: created.id, valueId })))
  }

  if (inputTasks.length > 0) {
    const insertedTasks = await db
      .insert(tasks)
      .values(inputTasks.map(({ referentIds: _r, groupIds: _g, ...rest }) => ({ ...rest, goalId: created.id })))
      .returning()

    // Zip the input's referent/group ids back onto the rows just inserted.
    // Relies on RETURNING preserving insert order, which Postgres does for a
    // single multi-row INSERT.
    const referentRows = inputTasks.flatMap((task, idx) => {
      const inserted = insertedTasks[idx]
      if (!inserted || !task.referentIds?.length) return []
      return task.referentIds.map((personId) => ({ taskId: inserted.id, personId }))
    })
    if (referentRows.length > 0) await db.insert(taskReferents).values(referentRows)

    const groupRows = inputTasks.flatMap((task, idx) => {
      const inserted = insertedTasks[idx]
      if (!inserted || !task.groupIds?.length) return []
      return task.groupIds.map((groupId) => ({ taskId: inserted.id, groupId }))
    })
    if (groupRows.length > 0) await db.insert(tasksToGroups).values(groupRows)
  }

  return created
}

/**
 * Goal updates intentionally never touch tasks — the schema rejects a `tasks`
 * field. Per-task edits go through the task service, because wiping and
 * re-inserting tasks here used to drop referent/group memberships and burn task
 * ids on every goal edit.
 */
export async function update(userId: string, input: UpdateGoal) {
  const { id, valueIds, position, ...goalData } = input

  if (Object.keys(goalData).length > 0 || position) {
    const updateData: Partial<typeof goals.$inferInsert> = { ...goalData, updatedAt: new Date() }
    if (position) {
      updateData.positionX = position.x
      updateData.positionY = position.y
    }
    await db
      .update(goals)
      .set(updateData)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
  }

  if (valueIds !== undefined) {
    await assertOwnsGoal(userId, id)
    await db.delete(goalValues).where(eq(goalValues.goalId, id))
    if (valueIds.length > 0) {
      await db.insert(goalValues).values(valueIds.map((valueId) => ({ goalId: id, valueId })))
    }
  }

  return { success: true }
}

/**
 * "Delete" is really an archive: the goal row survives with status='archived'
 * so historical weekly syncs that reference it keep resolving. What genuinely
 * goes away is graph topology — every edge touching it, in either direction —
 * because a dangling edge would break the importance computation.
 */
export async function remove(userId: string, id: string) {
  return await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .limit(1)
    if (!owned) throw new AppError('NOT_FOUND', 'Goal not found or access denied')

    await tx.update(goals).set({ status: 'archived', updatedAt: new Date() }).where(eq(goals.id, id))
    await tx.delete(connections).where(eq(connections.source, id))
    await tx.delete(connections).where(eq(connections.target, id))
    await tx
      .update(trackingItems)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(trackingItems.goalId, id))

    return { success: true }
  })
}
