// The weekly retrospective. A sync is a template-driven *snapshot* taken at
// create time, then freely mutable for that week — editing a template later
// never rewrites history.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/lib/data";
import {
  attachments,
  connections,
  goals,
  syncTemplateItems,
  syncTemplates,
  trackingItems,
  weeklySync,
  weeklySyncItems,
} from "~/lib/data/schema";
import { computeImportance } from "~/lib/computation/importance";
import type { AddSyncItem, CreateWeeklySync, RemoveSyncItem, ReorderSyncItems, SetSyncItemText } from "~/lib/api/types";
import { AppError } from "./errors";
import { fileUrl } from "./file-refs";

/** Throws NOT_FOUND unless the sync item's parent sync belongs to the user. */
async function assertOwnsSyncItem(userId: string, syncItemId: string) {
  const [row] = await db
    .select({ id: weeklySyncItems.id })
    .from(weeklySyncItems)
    .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
    .where(and(eq(weeklySyncItems.id, syncItemId), eq(weeklySync.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Sync item not found or access denied");
}

export async function getByWeek(userId: string, weekStart: Date) {
  const [row] = await db
    .select()
    .from(weeklySync)
    .where(and(eq(weeklySync.userId, userId), eq(weeklySync.weekDate, weekStart)))
    .limit(1);
  return row ?? null;
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
      .where(and(eq(weeklySync.userId, userId), eq(weeklySync.weekDate, weekStart)))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, "active"))),
    db
      .select()
      .from(trackingItems)
      .where(and(eq(trackingItems.userId, userId), eq(trackingItems.status, "active"), isNull(trackingItems.deletedAt)))
      .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt)),
  ]);

  // Second batch: connections (needs goalsData) and sync items (need the sync
  // row). Independent of each other, so again in parallel.
  const goalIds = goalsData.map((g) => g.id);
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
  ]);

  // Attachments depend on which sync items came back, so they need one more await.
  let attachmentsData: (typeof attachments.$inferSelect)[] = [];
  if (syncItemsData.length > 0) {
    attachmentsData = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.parentType, "weekly_sync_item"),
          inArray(
            attachments.parentId,
            syncItemsData.map((i) => i.id),
          ),
        ),
      )
      .orderBy(asc(attachments.createdAt));
  }

  const goalById = new Map(goalsData.map((g) => [g.id, g] as const));
  const itemById = new Map(allItems.map((i) => [i.id, i] as const));

  const hydratedItems = syncItemsData
    .map((si) => {
      const ti = itemById.get(si.trackingItemId);
      if (!ti) return null; // soft-deleted/archived/cross-user — drop
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
        }));
      return {
        id: si.id,
        trackingItemId: si.trackingItemId,
        title: ti.title,
        description: ti.description,
        orderIdx: si.orderIdx,
        textContent: si.textContent,
        attachments: itemAttachments,
        goalId: ti.goalId,
        createdAt: si.createdAt,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Group sync items by goal, with an "Unscoped" array for goalId IS NULL.
  const itemsByGoal = new Map<string, typeof hydratedItems>();
  const unscopedItems: typeof hydratedItems = [];
  for (const hi of hydratedItems) {
    if (hi.goalId === null || hi.goalId === undefined) {
      unscopedItems.push(hi);
      continue;
    }
    const arr = itemsByGoal.get(hi.goalId) ?? [];
    arr.push(hi);
    itemsByGoal.set(hi.goalId, arr);
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
    }));

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
  };
}

/**
 * Create a sync for the given week. If `templateId` is supplied — or omitted
 * and the user has a default template — the sync is populated by snapshotting
 * that template's items in their template-defined order.
 */
export async function create(userId: string, input: CreateWeeklySync) {
  return await db.transaction(async (tx) => {
    let templateId: string | null = input.templateId ?? null;
    if (templateId === null) {
      const [defaultTemplate] = await tx
        .select({ id: syncTemplates.id })
        .from(syncTemplates)
        .where(and(eq(syncTemplates.userId, userId), eq(syncTemplates.isDefault, true)))
        .limit(1);
      templateId = defaultTemplate?.id ?? null;
    } else {
      const [t] = await tx
        .select({ id: syncTemplates.id })
        .from(syncTemplates)
        .where(and(eq(syncTemplates.id, templateId), eq(syncTemplates.userId, userId)))
        .limit(1);
      if (!t) throw new AppError("NOT_FOUND", "Template not found or access denied");
    }

    const [created] = await tx.insert(weeklySync).values({ userId, weekDate: input.weekDate, templateId }).returning();
    if (!created) throw new AppError("INTERNAL_SERVER_ERROR", "Failed to create weekly sync");

    if (templateId) {
      const templateItemRows = await tx
        .select()
        .from(syncTemplateItems)
        .where(eq(syncTemplateItems.templateId, templateId))
        .orderBy(asc(syncTemplateItems.orderIdx));
      if (templateItemRows.length > 0) {
        await tx.insert(weeklySyncItems).values(
          templateItemRows.map((row) => ({
            weeklySyncId: created.id,
            trackingItemId: row.trackingItemId,
            orderIdx: row.orderIdx,
          })),
        );
      }
    }

    return created;
  });
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
    .limit(1);
  if (!sync) throw new AppError("NOT_FOUND", "Weekly sync not found or access denied");

  const [item] = await db
    .select({ id: trackingItems.id })
    .from(trackingItems)
    .where(and(eq(trackingItems.id, input.trackingItemId), eq(trackingItems.userId, userId)))
    .limit(1);
  if (!item) throw new AppError("NOT_FOUND", "Tracking item not found or access denied");

  const [existing] = await db
    .select()
    .from(weeklySyncItems)
    .where(
      and(
        eq(weeklySyncItems.weeklySyncId, input.weeklySyncId),
        eq(weeklySyncItems.trackingItemId, input.trackingItemId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${weeklySyncItems.orderIdx}), -1)` })
    .from(weeklySyncItems)
    .where(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId));
  const nextOrder = (maxRow?.max ?? -1) + 1;

  const [created] = await db
    .insert(weeklySyncItems)
    .values({
      weeklySyncId: input.weeklySyncId,
      trackingItemId: input.trackingItemId,
      orderIdx: nextOrder,
    })
    .returning();
  if (!created) throw new AppError("INTERNAL_SERVER_ERROR", "Failed to add sync item");
  return created;
}

/**
 * Remove a single item from a sync. Does NOT touch the underlying tracking
 * item — it stays in the user's library.
 */
export async function removeItem(userId: string, input: RemoveSyncItem) {
  await assertOwnsSyncItem(userId, input.weeklySyncItemId);

  // Attachments are polymorphic — there's no FK from attachments.parentId to
  // weeklySyncItems.id, so they have to be hand-deleted. attachments → files
  // cascades on fileId, so the blob goes away with the row.
  await db
    .delete(attachments)
    .where(and(eq(attachments.parentType, "weekly_sync_item"), eq(attachments.parentId, input.weeklySyncItemId)));
  await db.delete(weeklySyncItems).where(eq(weeklySyncItems.id, input.weeklySyncItemId));
  return { success: true };
}

export async function setItemText(userId: string, input: SetSyncItemText) {
  await assertOwnsSyncItem(userId, input.weeklySyncItemId);
  await db
    .update(weeklySyncItems)
    .set({ textContent: input.textContent, updatedAt: new Date() })
    .where(eq(weeklySyncItems.id, input.weeklySyncItemId));
  return { success: true };
}

export async function reorderItems(userId: string, input: ReorderSyncItems) {
  return await db.transaction(async (tx) => {
    const [sync] = await tx
      .select({ id: weeklySync.id })
      .from(weeklySync)
      .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, userId)))
      .limit(1);
    if (!sync) throw new AppError("NOT_FOUND", "Sync not found or access denied");

    // Every id must already belong to THIS sync — checked in one query up
    // front, so a forged id can't reorder (or touch) another sync's rows.
    const ids = input.ordering.map((o) => o.id);
    if (ids.length > 0) {
      const owned = await tx
        .select({ id: weeklySyncItems.id })
        .from(weeklySyncItems)
        .where(and(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId), inArray(weeklySyncItems.id, ids)));
      if (owned.length !== ids.length) {
        throw new AppError("BAD_REQUEST", "Ordering references items not in this sync");
      }
    }

    for (const o of input.ordering) {
      await tx
        .update(weeklySyncItems)
        .set({ orderIdx: o.orderIdx, updatedAt: new Date() })
        .where(eq(weeklySyncItems.id, o.id));
    }
    return { success: true };
  });
}
