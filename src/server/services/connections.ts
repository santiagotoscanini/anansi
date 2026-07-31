// Weighted edges between goals. Weight is the only mutable field; the graph's
// importance bands are derived from outgoing weights at render time.
//
// Connections carry no user_id — ownership is proven by joining back to goals.
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '~/lib/data'
import { connections, goals } from '~/lib/data/schema'
import type { CreateConnection, UpdateConnection } from '~/lib/api/types'
import { AppError } from './errors'

/** Throws NOT_FOUND unless the connection's source goal belongs to the user. */
async function assertOwnsConnection(userId: string, id: string) {
  const [row] = await db
    .select({ id: connections.id })
    .from(connections)
    .innerJoin(goals, eq(connections.source, goals.id))
    .where(and(eq(connections.id, id), eq(goals.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Connection not found or access denied')
}

export async function list(userId: string) {
  // Self-join: connections FK to goals on BOTH source and target, so Postgres
  // needs two distinct aliases to join the same table twice. Drizzle's alias()
  // produces separately-named handles — a previous `const sourceGoals = goals`
  // shared one alias across both joins and threw at query time.
  const sourceGoals = alias(goals, 'source_goals')
  const targetGoals = alias(goals, 'target_goals')

  const rows = await db
    .select({ connection: connections })
    .from(connections)
    .innerJoin(sourceGoals, eq(connections.source, sourceGoals.id))
    .innerJoin(targetGoals, eq(connections.target, targetGoals.id))
    .where(
      and(
        eq(sourceGoals.userId, userId),
        eq(targetGoals.userId, userId),
        // Archived goals keep their rows but must drop out of the graph.
        eq(sourceGoals.status, 'active'),
        eq(targetGoals.status, 'active'),
      ),
    )
  return rows.map((r) => r.connection)
}

export async function create(userId: string, input: CreateConnection) {
  const [source] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, input.source), eq(goals.userId, userId)))
    .limit(1)
  const [target] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, input.target), eq(goals.userId, userId)))
    .limit(1)
  if (!source || !target) {
    throw new AppError('NOT_FOUND', 'Source or target goal not found or access denied')
  }

  const [created] = await db.insert(connections).values(input).returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create connection')
  return created
}

export async function update(userId: string, input: UpdateConnection) {
  const { id, ...updateData } = input
  await assertOwnsConnection(userId, id)

  const [updated] = await db
    .update(connections)
    // updatedAt restated: every field in updateData is optional, so an id-only
    // patch would leave `.set({})`, which drizzle rejects before  runs.
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(connections.id, id))
    .returning()
  return updated
}

export async function remove(userId: string, id: string) {
  await assertOwnsConnection(userId, id)
  await db.delete(connections).where(eq(connections.id, id))
  return { success: true }
}
