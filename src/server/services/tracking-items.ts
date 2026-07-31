// The user's library of things they track week to week. Goal-link is optional:
// items with `goalId IS NULL` render as "Unscoped", and goal deletion sets the
// column to NULL rather than cascading, so the item survives its goal.
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '~/lib/data'
import { goals, trackingItems, weeklySyncItems } from '~/lib/data/schema'
import type { CreateTrackingItem, UpdateTrackingItem } from '~/lib/api/types'
import { AppError } from './errors'

/** Throws NOT_FOUND unless the tracking item exists and is the caller's. */
async function assertOwnsItem(userId: string, id: string) {
  const [row] = await db
    .select({ id: trackingItems.id })
    .from(trackingItems)
    .where(and(eq(trackingItems.id, id), eq(trackingItems.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Tracking item not found or access denied')
}

async function assertOwnsGoal(userId: string, goalId: string) {
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Goal not found or access denied')
}

export async function list(userId: string, input?: { goalId?: string }) {
  const conditions = [
    eq(trackingItems.userId, userId),
    isNull(trackingItems.deletedAt),
    eq(trackingItems.status, 'active'),
  ]
  if (input?.goalId) conditions.push(eq(trackingItems.goalId, input.goalId))
  return await db
    .select()
    .from(trackingItems)
    .where(and(...conditions))
    .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt))
}

export async function create(userId: string, input: CreateTrackingItem) {
  if (input.goalId) await assertOwnsGoal(userId, input.goalId)

  const [created] = await db
    .insert(trackingItems)
    .values({
      userId,
      goalId: input.goalId ?? null,
      title: input.title,
      description: input.description ?? null,
      order: input.order ?? 0,
    })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create tracking item')
  return created
}

export async function update(userId: string, input: UpdateTrackingItem) {
  const { id, ...updateData } = input
  await assertOwnsItem(userId, id)
  // Re-point to a different goal only if that goal is also the caller's.
  if (updateData.goalId) await assertOwnsGoal(userId, updateData.goalId)

  const [updated] = await db
    .update(trackingItems)
    .set({ ...updateData })
    .where(eq(trackingItems.id, id))
    .returning()
  return updated
}

/**
 * Soft-delete when any sync references the item (history must keep resolving),
 * hard-delete otherwise. The returned `type` tells the caller which happened.
 */
export async function remove(userId: string, id: string) {
  await assertOwnsItem(userId, id)

  const [referenced] = await db
    .select({ id: weeklySyncItems.id })
    .from(weeklySyncItems)
    .where(eq(weeklySyncItems.trackingItemId, id))
    .limit(1)

  if (referenced) {
    // .returning() so we can detect the silently-empty case (row hard-deleted
    // between the existence check and this update by a concurrent request, or
    // some other corruption). Better to fail loud than to report "success"
    // while nothing changed.
    const updated = await db
      .update(trackingItems)
      .set({ deletedAt: new Date() })
      .where(eq(trackingItems.id, id))
      .returning({ id: trackingItems.id })
    if (updated.length === 0) {
      throw new AppError('INTERNAL_SERVER_ERROR', 'Tracking item soft-delete touched 0 rows')
    }
    return { success: true, type: 'soft_delete' as const }
  }

  await db.delete(trackingItems).where(eq(trackingItems.id, id))
  return { success: true, type: 'hard_delete' as const }
}
