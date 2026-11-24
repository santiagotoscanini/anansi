// The user's library of things they track week to week. Goal-link is optional:
// items with `goalId IS NULL` render as "Unscoped", and goal deletion sets the
// column to NULL rather than cascading, so the item survives its goal.
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '~/lib/data'
import { attachments, goals, trackingItems, weeklySync, weeklySyncItems } from '~/lib/data/schema'
import {
  createTrackingItemSchema,
  updateTrackingItemSchema,
  type CreateTrackingItem,
  type UpdateTrackingItem,
} from '~/lib/api/types'
import type { Overlay } from '~/lib/overlay'
import { weekDayOf } from '~/lib/week'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { summariesFor } from './health'
import { blocksOf } from './weekly-sync'

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

export async function create(userId: string, raw: CreateTrackingItem) {
  const input = createTrackingItemSchema.parse(raw)
  if (input.goalId) await assertOwnsGoal(userId, input.goalId)

  const [created] = await db
    .insert(trackingItems)
    .values({
      userId,
      goalId: input.goalId ?? null,
      title: input.title,
      description: input.description ?? null,
      order: input.order ?? 0,
      photosPerWeek: input.photosPerWeek ?? null,
      healthMetric: input.healthMetric ?? null,
    })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create tracking item')
  return created
}

export async function update(userId: string, raw: UpdateTrackingItem) {
  const { id, ...updateData } = updateTrackingItemSchema.parse(raw)
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

/** Sets or clears (`null`) the camera overlay drawn for an item. */
export async function setOverlay(userId: string, id: string, overlay: Overlay | null) {
  await assertOwnsItem(userId, id)
  const [updated] = await db
    .update(trackingItems)
    .set({ overlay, updatedAt: new Date() })
    .where(eq(trackingItems.id, id))
    .returning()
  return updated
}

/**
 * The newest picture attached to any week's copy of this item, for the camera's
 * "last time" ghost. `excludeSyncItemId` leaves out the week being filled, so
 * the ghost is the previous picture rather than the one just taken.
 */
export async function latestPicture(userId: string, id: string, excludeSyncItemId?: string) {
  await assertOwnsItem(userId, id)
  const conditions = [
    eq(weeklySyncItems.trackingItemId, id),
    eq(weeklySync.userId, userId),
    eq(attachments.parentType, 'weekly_sync_item'),
    eq(attachments.fileType, 'image'),
  ]
  if (excludeSyncItemId) conditions.push(ne(weeklySyncItems.id, excludeSyncItemId))
  const [row] = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileType: attachments.fileType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      weeklySyncItemId: weeklySyncItems.id,
      weekDate: weeklySync.weekDate,
    })
    .from(attachments)
    .innerJoin(weeklySyncItems, eq(attachments.parentId, weeklySyncItems.id))
    .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
    .where(and(...conditions))
    .orderBy(desc(weeklySync.weekDate), desc(attachments.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * One item over time: every week that recorded something for it (notes or
 * files), oldest first. A week is named by its Sunday's calendar day, so the
 * caller never has to read `week_date`'s instant (see `weekDayOf`).
 *
 * Archived and soft-deleted items answer too: their weeks are still there,
 * and looking back is what this is for.
 */
export async function history(userId: string, id: string) {
  const [item] = await db
    .select({
      id: trackingItems.id,
      title: trackingItems.title,
      description: trackingItems.description,
      goalId: trackingItems.goalId,
      status: trackingItems.status,
      deletedAt: trackingItems.deletedAt,
      photosPerWeek: trackingItems.photosPerWeek,
      healthMetric: trackingItems.healthMetric,
    })
    .from(trackingItems)
    .where(and(eq(trackingItems.id, id), eq(trackingItems.userId, userId)))
    .limit(1)
  if (!item) throw new AppError('NOT_FOUND', 'Tracking item not found or access denied')

  const rows = await db
    .select({
      syncItemId: weeklySyncItems.id,
      weekDate: weeklySync.weekDate,
      textContent: weeklySyncItems.textContent,
    })
    .from(weeklySyncItems)
    .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
    .where(and(eq(weeklySyncItems.trackingItemId, id), eq(weeklySync.userId, userId)))
    .orderBy(asc(weeklySync.weekDate))

  const files = rows.length
    ? await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.parentType, 'weekly_sync_item'),
            inArray(
              attachments.parentId,
              rows.map((row) => row.syncItemId),
            ),
          ),
        )
        .orderBy(asc(attachments.createdAt))
    : []

  const blocks = await blocksOf(rows.map((row) => row.syncItemId))
  const metric = item.healthMetric
  const summary =
    metric && rows.length
      ? await summariesFor(
          userId,
          rows.map((row) => weekDayOf(row.weekDate)),
        )
      : null

  const weeks = rows
    .map((row) => ({
      syncItemId: row.syncItemId,
      week: weekDayOf(row.weekDate),
      textContent: row.textContent?.trim() ? row.textContent : null,
      blocks: blocks
        .filter((b) => b.weeklySyncItemId === row.syncItemId)
        .map((b) => ({ id: b.id, title: b.title, content: b.content, orderIdx: b.orderIdx, updatedAt: b.updatedAt })),
      health: metric && summary ? summary(metric, weekDayOf(row.weekDate)) : null,
      attachments: files
        .filter((file) => file.parentId === row.syncItemId)
        .map((file) => ({
          id: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          url: fileUrl(file.fileId),
          sizeBytes: file.sizeBytes,
          createdAt: file.createdAt,
        })),
    }))
    .filter((week) => week.textContent !== null || week.attachments.length > 0 || week.blocks.length > 0)

  return {
    item: {
      id: item.id,
      title: item.title,
      description: item.description,
      goalId: item.goalId,
      photosPerWeek: item.photosPerWeek,
      healthMetric: item.healthMetric,
      archived: item.status === 'archived' || item.deletedAt !== null,
    },
    weeks,
  }
}
