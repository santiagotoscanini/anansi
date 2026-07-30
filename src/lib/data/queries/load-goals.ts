// Load every goal a user owns, fully hydrated for the API surface (Goal[]
// shape: tasks + their referent and group memberships, valueIds, computed
// importance). Both `goals.goals.getAll` and `goals.data.getAll` used to
// inline this 6-query block — keeping the logic in one place ensures the
// two endpoints can never drift on what "a goal" looks like.

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../index'
import { goals, tasks, taskReferents, tasksToGroups, goalValues, connections } from '../schema'
import { computeImportance } from '../../computation/importance'
import type { Goal } from '../../api/types'

interface LoadGoalsResult {
  goals: Goal[]
  // Flat connection rows (source/target/weight) — exposed alongside the
  // mapped goals because data.getAll returns them as a peer field.
  connections: (typeof connections.$inferSelect)[]
}

export async function loadGoalsForUser(userId: string): Promise<LoadGoalsResult> {
  const goalsData = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
  const goalIds = goalsData.map((g) => g.id)

  // tasks/goalValues/connections all join on goals to enforce ownership and
  // skip archived goals — same pattern as the original inline blocks.
  const tasksData = await db
    .select()
    .from(tasks)
    .innerJoin(goals, eq(tasks.goalId, goals.id))
    .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))

  const taskIds = tasksData.map((t) => t.tasks.id)
  const referentsData = taskIds.length
    ? await db.select().from(taskReferents).where(inArray(taskReferents.taskId, taskIds))
    : []
  const taskGroupsData = taskIds.length
    ? await db.select().from(tasksToGroups).where(inArray(tasksToGroups.taskId, taskIds))
    : []

  const goalValuesData = await db
    .select()
    .from(goalValues)
    .innerJoin(goals, eq(goalValues.goalId, goals.id))
    .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))

  const connectionsData =
    goalIds.length > 0
      ? await db
          .select()
          .from(connections)
          .innerJoin(goals, eq(connections.source, goals.id))
          .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
      : []

  const flatConnections = connectionsData.map((item) => item.connections)

  const mappedGoals: Goal[] = goalsData.map((goal) => ({
    id: goal.id,
    title: goal.title,
    description: goal.description,
    emoji: goal.emoji ?? undefined,
    parentId: goal.parentId ?? undefined,
    position: { x: goal.positionX, y: goal.positionY },
    importance: computeImportance(flatConnections, goal.id),
    status: goal.status,
    valueIds: goalValuesData
      .filter((item) => item.goal_values.goalId === goal.id)
      .map((item) => item.goal_values.valueId),
    tasks: tasksData
      .filter((item) => item.tasks.goalId === goal.id)
      .map((item) => ({
        id: item.tasks.id,
        title: item.tasks.title,
        description: item.tasks.description ?? null,
        emoji: item.tasks.emoji ?? null,
        difficulty: item.tasks.difficulty as 1 | 2 | 3,
        completed: item.tasks.completed,
        scheduledAt: item.tasks.scheduledAt ?? null,
        referentIds: referentsData.filter((r) => r.taskId === item.tasks.id).map((r) => r.personId),
        groupIds: taskGroupsData.filter((g) => g.taskId === item.tasks.id).map((g) => g.groupId),
      })),
  }))

  return { goals: mappedGoals, connections: flatConnections }
}
