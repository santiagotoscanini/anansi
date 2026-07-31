// User-defined tags that span BOTH people and tasks — "Family" can hold a
// partner and the "call mom" task. The table is still named `person_groups`
// for backwards compat; the user-facing concept is just "Groups".
import { and, asc, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { goals, personGroups, tasks, tasksToGroups } from '~/lib/data/schema'
import type { CreatePersonGroup, UpdatePersonGroup } from '~/lib/api/types'
import { AppError } from './errors'

export async function list(userId: string) {
  return await db
    .select()
    .from(personGroups)
    .where(eq(personGroups.userId, userId))
    .orderBy(asc(personGroups.orderIdx), asc(personGroups.createdAt))
}

export async function create(userId: string, input: CreatePersonGroup) {
  const [row] = await db
    .insert(personGroups)
    .values({ ...input, userId })
    .returning()
  if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create group')
  return row
}

export async function update(userId: string, input: UpdatePersonGroup) {
  const { id, ...rest } = input
  const [updated] = await db
    .update(personGroups)
    // updatedAt restated — see services/connections.ts update.
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(personGroups.id, id), eq(personGroups.userId, userId)))
    .returning()
  return updated
}

export async function remove(userId: string, id: string) {
  await db.delete(personGroups).where(and(eq(personGroups.id, id), eq(personGroups.userId, userId)))
  return { success: true }
}

/**
 * Tasks tagged with a group, joined with goal context. Drives the Tasks section
 * of the group filter view, alongside the group's people.
 *
 * Two ownership checks, deliberately: the group's own userId, and the parent
 * goal's — a junction row alone can't prove the task is the caller's.
 */
export async function getTasks(userId: string, groupId: string) {
  const [group] = await db
    .select({ id: personGroups.id })
    .from(personGroups)
    .where(and(eq(personGroups.id, groupId), eq(personGroups.userId, userId)))
    .limit(1)
  if (!group) return []

  return await db
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      completed: tasks.completed,
      difficulty: tasks.difficulty,
      scheduledAt: tasks.scheduledAt,
      goalId: goals.id,
      goalTitle: goals.title,
      goalEmoji: goals.emoji,
    })
    .from(tasksToGroups)
    .innerJoin(tasks, eq(tasksToGroups.taskId, tasks.id))
    .innerJoin(goals, eq(tasks.goalId, goals.id))
    .where(and(eq(tasksToGroups.groupId, groupId), eq(goals.userId, userId), eq(goals.status, 'active')))
}
