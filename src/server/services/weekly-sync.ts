// The weekly retrospective. A sync is a template-driven *snapshot* taken at
// create time, then freely mutable for that week — editing a template later
// never rewrites history.
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '~/lib/data'
import {
  attachments,
  connections,
  goals,
  people,
  syncItemBlocks,
  syncTemplateItems,
  syncTemplates,
  trackingItems,
  weeklySync,
  weeklySyncItems,
} from '~/lib/data/schema'
import { computeImportance } from '~/lib/computation/importance'
import { nextOrder, syncItemMentionIds } from '~/lib/sync-item'
import { WEEK_MATCH_MS, weekDayOf } from '~/lib/week'
import {
  addSyncItemBlockSchema,
  removeSyncItemBlockSchema,
  reorderSyncItemBlocksSchema,
  updateSyncItemBlockSchema,
  type AddSyncItem,
  type CreateWeeklySync,
  type RemoveSyncItem,
  type ReorderSyncItems,
  type SetSyncItemText,
} from '~/lib/api/types'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { deleteFiles } from './files'
import { summariesFor } from './health'
import { indexSyncItem, linkTexts, mentionedIn } from './mentions'

/** Throws NOT_FOUND unless the sync item's parent sync belongs to the user. */
async function assertOwnsSyncItem(userId: string, syncItemId: string) {
  const [row] = await db
    .select({ id: weeklySyncItems.id })
    .from(weeklySyncItems)
    .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
    .where(and(eq(weeklySyncItems.id, syncItemId), eq(weeklySync.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Sync item not found or access denied')
}

/**
 * The user's sync for this week, by week rather than by instant.
 *
 * `week_date` holds whatever Sunday the creator's clock said, so an exact match
 * would miss a sync made on another clock, and the unique index would then let
 * the same week be started twice. See WEEK_MATCH_MS.
 */
function sameWeek(userId: string, week: Date) {
  return and(
    eq(weeklySync.userId, userId),
    gte(weeklySync.weekDate, new Date(week.getTime() - WEEK_MATCH_MS)),
    lte(weeklySync.weekDate, new Date(week.getTime() + WEEK_MATCH_MS)),
  )
}

export async function getByWeek(userId: string, weekStart: Date) {
  const [row] = await db.select().from(weeklySync).where(sameWeek(userId, weekStart)).limit(1)
  return row ?? null
}

/**
 * Hydrates everything the retro UI needs in one round trip:
 *   - the weeklySync row (or null)
 *   - the user's full tracking-items library, so the "+ add item" picker can
 *     offer items not yet on this sync
 *   - the weekly_sync_items with text_content inline + attachments hydrated
 *   - active goals for grouping; items with `goalId IS NULL` go into the
 *     separate `unscopedItems` array
 */
export async function getWeeklyRetrospectiveData(userId: string, weekStart: Date) {
  // First batch: three independent queries — the sync row, the user's active
  // goals, the full tracking-items library. Nothing here depends on anything
  // else, so run them together.
  const [weeklySyncRecord, goalsData, allItems] = await Promise.all([
    db
      .select()
      .from(weeklySync)
      .where(sameWeek(userId, weekStart))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, 'active'))),
    db
      .select()
      .from(trackingItems)
      .where(and(eq(trackingItems.userId, userId), eq(trackingItems.status, 'active'), isNull(trackingItems.deletedAt)))
      .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt)),
  ])

  // Second batch: connections (needs goalsData) and sync items (need the sync
  // row). Independent of each other, so again in parallel.
  const goalIds = goalsData.map((g) => g.id)
  const [allConns, syncItemsData] = await Promise.all([
    goalIds.length
      ? db.select().from(connections).where(inArray(connections.source, goalIds))
      : Promise.resolve([] as (typeof connections.$inferSelect)[]),
    weeklySyncRecord
      ? db
          .select()
          .from(weeklySyncItems)
          .where(eq(weeklySyncItems.weeklySyncId, weeklySyncRecord.id))
          .orderBy(asc(weeklySyncItems.orderIdx), asc(weeklySyncItems.createdAt))
      : Promise.resolve([] as (typeof weeklySyncItems.$inferSelect)[]),
  ])

  // Attachments and blocks depend on which sync items came back, so they need one more await.
  let attachmentsData: (typeof attachments.$inferSelect)[] = []
  let blocksData: (typeof syncItemBlocks.$inferSelect)[] = []
  if (syncItemsData.length > 0) {
    blocksData = await blocksOf(syncItemsData.map((i) => i.id))
    attachmentsData = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.parentType, 'weekly_sync_item'),
          inArray(
            attachments.parentId,
            syncItemsData.map((i) => i.id),
          ),
        ),
      )
      .orderBy(asc(attachments.createdAt))
  }

  const goalById = new Map(goalsData.map((g) => [g.id, g] as const))
  const itemById = new Map(allItems.map((i) => [i.id, i] as const))

  // The week's Apple Health figure, for the items that follow a metric.
  const sunday = weeklySyncRecord ? weekDayOf(weeklySyncRecord.weekDate) : null
  const followsHealth = syncItemsData.some((si) => itemById.get(si.trackingItemId)?.healthMetric)
  const summary = sunday && followsHealth ? await summariesFor(userId, [sunday]) : null

  const hydratedItems = syncItemsData
    .map((si) => {
      const ti = itemById.get(si.trackingItemId)
      if (!ti) return null // soft-deleted/archived/cross-user — drop
      // Attachments resolve to `/api/files/{fileId}` URLs; the serving route
      // auth-gates by session cookie, so there's no per-render URL signing.
      const itemAttachments = attachmentsData
        .filter((a) => a.parentId === si.id)
        .map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileType: a.fileType,
          url: fileUrl(a.fileId),
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt,
        }))
      return {
        id: si.id,
        trackingItemId: si.trackingItemId,
        title: ti.title,
        description: ti.description,
        orderIdx: si.orderIdx,
        textContent: si.textContent,
        blocks: blocksData.filter((b) => b.weeklySyncItemId === si.id).map(blockOut),
        attachments: itemAttachments,
        goalId: ti.goalId,
        photosPerWeek: ti.photosPerWeek,
        healthMetric: ti.healthMetric,
        health: ti.healthMetric && summary && sunday ? summary(ti.healthMetric, sunday) : null,
        createdAt: si.createdAt,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Group sync items by goal, with an "Unscoped" array for goalId IS NULL.
  const itemsByGoal = new Map<string, typeof hydratedItems>()
  const unscopedItems: typeof hydratedItems = []
  for (const hi of hydratedItems) {
    if (hi.goalId === null || hi.goalId === undefined) {
      unscopedItems.push(hi)
      continue
    }
    const arr = itemsByGoal.get(hi.goalId) ?? []
    arr.push(hi)
    itemsByGoal.set(hi.goalId, arr)
  }

  const goalGroups = goalsData
    .filter((g) => itemsByGoal.has(g.id))
    .map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      // computeImportance reads the same `(source, weight)` shape allConns has.
      importance: computeImportance(allConns, g.id),
      items: itemsByGoal.get(g.id) ?? [],
    }))

  return {
    weeklySync: weeklySyncRecord ?? null,
    allTrackingItems: allItems.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      goalId: i.goalId,
      goalTitle: i.goalId ? (goalById.get(i.goalId)?.title ?? null) : null,
    })),
    goals: goalGroups,
    unscopedItems,
  }
}

/**
 * Create a sync for the given week. If `templateId` is supplied — or omitted
 * and the user has a default template — the sync is populated by snapshotting
 * that template's items in their template-defined order.
 *
 * Asking again for a week that has a sync returns that sync, unchanged.
 */
export async function create(userId: string, input: CreateWeeklySync) {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(weeklySync).where(sameWeek(userId, input.weekDate)).limit(1)
    if (existing) return existing

    let templateId: string | null = input.templateId ?? null
    if (templateId === null) {
      const [defaultTemplate] = await tx
        .select({ id: syncTemplates.id })
        .from(syncTemplates)
        .where(and(eq(syncTemplates.userId, userId), eq(syncTemplates.isDefault, true)))
        .limit(1)
      templateId = defaultTemplate?.id ?? null
    } else {
      const [t] = await tx
        .select({ id: syncTemplates.id })
        .from(syncTemplates)
        .where(and(eq(syncTemplates.id, templateId), eq(syncTemplates.userId, userId)))
        .limit(1)
      if (!t) throw new AppError('NOT_FOUND', 'Template not found or access denied')
    }

    const [created] = await tx.insert(weeklySync).values({ userId, weekDate: input.weekDate, templateId }).returning()
    if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create weekly sync')

    if (templateId) {
      const templateItemRows = await tx
        .select()
        .from(syncTemplateItems)
        .where(eq(syncTemplateItems.templateId, templateId))
        .orderBy(asc(syncTemplateItems.orderIdx))
      if (templateItemRows.length > 0) {
        await tx.insert(weeklySyncItems).values(
          templateItemRows.map((row) => ({
            weeklySyncId: created.id,
            trackingItemId: row.trackingItemId,
            orderIdx: row.orderIdx,
          })),
        )
      }
    }

    return created
  })
}

/**
 * Add a single item to an existing sync. Idempotent — returns the existing row
 * if the (sync, item) pair is already there.
 */
export async function addItem(userId: string, input: AddSyncItem) {
  const [sync] = await db
    .select({ id: weeklySync.id })
    .from(weeklySync)
    .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, userId)))
    .limit(1)
  if (!sync) throw new AppError('NOT_FOUND', 'Weekly sync not found or access denied')

  const [item] = await db
    .select({ id: trackingItems.id })
    .from(trackingItems)
    .where(and(eq(trackingItems.id, input.trackingItemId), eq(trackingItems.userId, userId)))
    .limit(1)
  if (!item) throw new AppError('NOT_FOUND', 'Tracking item not found or access denied')

  const [existing] = await db
    .select()
    .from(weeklySyncItems)
    .where(
      and(
        eq(weeklySyncItems.weeklySyncId, input.weeklySyncId),
        eq(weeklySyncItems.trackingItemId, input.trackingItemId),
      ),
    )
    .limit(1)
  if (existing) return existing

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${weeklySyncItems.orderIdx}), -1)` })
    .from(weeklySyncItems)
    .where(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId))
  const nextOrder = (maxRow?.max ?? -1) + 1

  const [created] = await db
    .insert(weeklySyncItems)
    .values({
      weeklySyncId: input.weeklySyncId,
      trackingItemId: input.trackingItemId,
      orderIdx: nextOrder,
    })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to add sync item')
  return created
}

/**
 * Remove a single item from a sync. Does NOT touch the underlying tracking
 * item — it stays in the user's library.
 */
export async function removeItem(userId: string, input: RemoveSyncItem) {
  await assertOwnsSyncItem(userId, input.weeklySyncItemId)

  // Attachments are polymorphic — there's no FK from attachments.parentId to
  // weeklySyncItems.id, so they have to be hand-deleted. Deleting their files
  // does it: the bytes leave the bucket first, then the file rows, and
  // files → attachments cascades on fileId.
  const attached = await db
    .select({ fileId: attachments.fileId })
    .from(attachments)
    .where(and(eq(attachments.parentType, 'weekly_sync_item'), eq(attachments.parentId, input.weeklySyncItemId)))
  await deleteFiles(attached.map((a) => a.fileId))
  await db.delete(weeklySyncItems).where(eq(weeklySyncItems.id, input.weeklySyncItemId))
  return { success: true }
}

export async function setItemText(userId: string, input: SetSyncItemText) {
  await assertOwnsSyncItem(userId, input.weeklySyncItemId)
  // Notes can name people (`@Name`, see ~/lib/mentions): linked on every write,
  // with `sync_item_mentions` rebuilt from the result.
  const [existing] = await db
    .select({ textContent: weeklySyncItems.textContent })
    .from(weeklySyncItems)
    .where(eq(weeklySyncItems.id, input.weeklySyncItemId))
    .limit(1)
  const {
    texts: [textContent = ''],
  } = await linkTexts(userId, [input.textContent], mentionedIn(existing?.textContent))
  await db.update(weeklySyncItems).set({ textContent }).where(eq(weeklySyncItems.id, input.weeklySyncItemId))
  await reindexMentions(input.weeklySyncItemId)
  return { success: true }
}

export async function reorderItems(userId: string, input: ReorderSyncItems) {
  return await db.transaction(async (tx) => {
    const [sync] = await tx
      .select({ id: weeklySync.id })
      .from(weeklySync)
      .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, userId)))
      .limit(1)
    if (!sync) throw new AppError('NOT_FOUND', 'Sync not found or access denied')

    // Every id must already belong to THIS sync — checked in one query up
    // front, so a forged id can't reorder (or touch) another sync's rows.
    const ids = input.ordering.map((o) => o.id)
    if (ids.length > 0) {
      const owned = await tx
        .select({ id: weeklySyncItems.id })
        .from(weeklySyncItems)
        .where(and(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId), inArray(weeklySyncItems.id, ids)))
      if (owned.length !== ids.length) {
        throw new AppError('BAD_REQUEST', 'Ordering references items not in this sync')
      }
    }

    for (const o of input.ordering) {
      await tx.update(weeklySyncItems).set({ orderIdx: o.orderIdx }).where(eq(weeklySyncItems.id, o.id))
    }
    return { success: true }
  })
}

// ── Named blocks ─────────────────────────────────────────────────────────────
// Extra text under a sync item's notes, each with a short title: a meeting's
// transcript, its summary. Content names people like the notes do.

function blockOut(b: typeof syncItemBlocks.$inferSelect) {
  return { id: b.id, title: b.title, content: b.content, orderIdx: b.orderIdx, updatedAt: b.updatedAt }
}

export type SyncItemBlock = ReturnType<typeof blockOut>

/** The blocks of these sync items, in order. */
export async function blocksOf(syncItemIds: readonly string[]) {
  if (!syncItemIds.length) return []
  return await db
    .select()
    .from(syncItemBlocks)
    .where(inArray(syncItemBlocks.weeklySyncItemId, [...syncItemIds]))
    .orderBy(asc(syncItemBlocks.orderIdx), asc(syncItemBlocks.createdAt))
}

/**
 * Rebuilds a sync item's `sync_item_mentions` from its notes and every block,
 * after any write to either. A person deleted since a text was written stays
 * named in it but is not indexed.
 */
async function reindexMentions(syncItemId: string) {
  const [item] = await db
    .select({ textContent: weeklySyncItems.textContent })
    .from(weeklySyncItems)
    .where(eq(weeklySyncItems.id, syncItemId))
    .limit(1)
  const blocks = await db
    .select({ content: syncItemBlocks.content })
    .from(syncItemBlocks)
    .where(eq(syncItemBlocks.weeklySyncItemId, syncItemId))
  const named = syncItemMentionIds(item?.textContent, blocks)
  const live = named.length
    ? (await db.select({ id: people.id }).from(people).where(inArray(people.id, named))).map((p) => p.id)
    : []
  await indexSyncItem(syncItemId, live)
}

/** The block, if its sync item is the user's; NOT_FOUND otherwise. */
async function ownedBlock(userId: string, id: string) {
  const [row] = await db
    .select({ block: syncItemBlocks })
    .from(syncItemBlocks)
    .innerJoin(weeklySyncItems, eq(syncItemBlocks.weeklySyncItemId, weeklySyncItems.id))
    .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
    .where(and(eq(syncItemBlocks.id, id), eq(weeklySync.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Block not found or access denied')
  return row.block
}

/** Adds a block at the end of the item's blocks. `@Name` in its content is linked. */
export async function addBlock(userId: string, raw: unknown) {
  const input = addSyncItemBlockSchema.parse(raw)
  await assertOwnsSyncItem(userId, input.weeklySyncItemId)
  const {
    texts: [content = ''],
  } = await linkTexts(userId, [input.content ?? ''])
  const existing = await db
    .select({ orderIdx: syncItemBlocks.orderIdx })
    .from(syncItemBlocks)
    .where(eq(syncItemBlocks.weeklySyncItemId, input.weeklySyncItemId))
  const [created] = await db
    .insert(syncItemBlocks)
    .values({ weeklySyncItemId: input.weeklySyncItemId, title: input.title, content, orderIdx: nextOrder(existing) })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to add block')
  if (content.includes('@')) await reindexMentions(input.weeklySyncItemId)
  return blockOut(created)
}

/** Changes a block's title, content or both (a field left out stays). */
export async function updateBlock(userId: string, raw: unknown) {
  const input = updateSyncItemBlockSchema.parse(raw)
  const block = await ownedBlock(userId, input.id)
  const patch: Partial<typeof syncItemBlocks.$inferInsert> = { updatedAt: new Date() }
  if (input.title !== undefined) patch.title = input.title
  if (input.content !== undefined) {
    const {
      texts: [content = ''],
    } = await linkTexts(userId, [input.content], mentionedIn(block.content))
    patch.content = content
  }
  const [updated] = await db.update(syncItemBlocks).set(patch).where(eq(syncItemBlocks.id, input.id)).returning()
  if (!updated) throw new AppError('NOT_FOUND', 'Block not found or access denied')
  if (input.content !== undefined) await reindexMentions(block.weeklySyncItemId)
  return blockOut(updated)
}

export async function removeBlock(userId: string, raw: unknown) {
  const input = removeSyncItemBlockSchema.parse(raw)
  const block = await ownedBlock(userId, input.id)
  await db.delete(syncItemBlocks).where(eq(syncItemBlocks.id, input.id))
  await reindexMentions(block.weeklySyncItemId)
  return { success: true }
}

/** Puts the item's blocks in the order of `ids`, which must be exactly its blocks. */
export async function reorderBlocks(userId: string, raw: unknown) {
  const input = reorderSyncItemBlocksSchema.parse(raw)
  await assertOwnsSyncItem(userId, input.weeklySyncItemId)
  return await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: syncItemBlocks.id })
      .from(syncItemBlocks)
      .where(eq(syncItemBlocks.weeklySyncItemId, input.weeklySyncItemId))
    const have = new Set(current.map((b) => b.id))
    if (
      input.ids.length !== have.size ||
      new Set(input.ids).size !== have.size ||
      input.ids.some((id) => !have.has(id))
    ) {
      throw new AppError('BAD_REQUEST', 'The order must name every block of this sync item once')
    }
    for (const [orderIdx, id] of input.ids.entries()) {
      await tx.update(syncItemBlocks).set({ orderIdx }).where(eq(syncItemBlocks.id, id))
    }
    return { success: true }
  })
}
