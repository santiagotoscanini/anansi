// Named bundles of tracking items. The user's default template auto-snapshots
// into each new weekly sync.
//
// "At most one default per user" is enforced by a partial unique index, which
// is why every write that can set `isDefault` clears the previous default in
// the same transaction first — otherwise the index rejects the insert.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "~/lib/data";
import { syncTemplateItems, syncTemplates, trackingItems } from "~/lib/data/schema";
import type { CreateSyncTemplate, SetSyncTemplateItems, UpdateSyncTemplate } from "~/lib/api/types";
import { AppError } from "./errors";

/** Transaction handle, so the guards below work inside and outside a tx. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = Tx | typeof db;

async function assertOwnsTemplate(tx: Db, userId: string, id: string) {
  const [row] = await tx
    .select({ id: syncTemplates.id })
    .from(syncTemplates)
    .where(and(eq(syncTemplates.id, id), eq(syncTemplates.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Template not found or access denied");
}

async function clearDefault(tx: Db, userId: string) {
  await tx
    .update(syncTemplates)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(syncTemplates.userId, userId), eq(syncTemplates.isDefault, true)));
}

export async function list(userId: string) {
  const templates = await db
    .select()
    .from(syncTemplates)
    .where(eq(syncTemplates.userId, userId))
    .orderBy(asc(syncTemplates.createdAt));
  if (templates.length === 0) {
    return [] as Array<(typeof templates)[number] & { items: (typeof syncTemplateItems.$inferSelect)[] }>;
  }

  const items = await db
    .select()
    .from(syncTemplateItems)
    .where(
      inArray(
        syncTemplateItems.templateId,
        templates.map((t) => t.id),
      ),
    )
    .orderBy(asc(syncTemplateItems.orderIdx));
  return templates.map((t) => ({
    ...t,
    items: items.filter((i) => i.templateId === t.id),
  }));
}

export async function create(userId: string, input: CreateSyncTemplate) {
  return await db.transaction(async (tx) => {
    if (input.isDefault) await clearDefault(tx, userId);

    const [created] = await tx
      .insert(syncTemplates)
      .values({ userId, name: input.name, isDefault: input.isDefault ?? false })
      .returning();
    if (!created) throw new AppError("INTERNAL_SERVER_ERROR", "Failed to create sync template");
    return created;
  });
}

export async function update(userId: string, input: UpdateSyncTemplate) {
  const { id, ...updateData } = input;
  return await db.transaction(async (tx) => {
    await assertOwnsTemplate(tx, userId, id);
    if (updateData.isDefault) await clearDefault(tx, userId);

    const [updated] = await tx
      .update(syncTemplates)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(syncTemplates.id, id))
      .returning();
    return updated;
  });
}

export async function remove(userId: string, id: string) {
  await assertOwnsTemplate(db, userId, id);
  await db.delete(syncTemplates).where(eq(syncTemplates.id, id));
  return { success: true };
}

/**
 * Replace-set semantics on the template's item list — mirror of
 * bucketList.update's personIds[] pattern.
 *
 * Every referenced tracking item is ownership-checked in one query before the
 * delete, so a forged id can't smuggle another user's item into the template.
 */
export async function setItems(userId: string, input: SetSyncTemplateItems) {
  return await db.transaction(async (tx) => {
    await assertOwnsTemplate(tx, userId, input.templateId);

    if (input.items.length > 0) {
      const ids = input.items.map((i) => i.trackingItemId);
      const owned = await tx
        .select({ id: trackingItems.id })
        .from(trackingItems)
        .where(and(inArray(trackingItems.id, ids), eq(trackingItems.userId, userId)));
      if (owned.length !== ids.length) {
        throw new AppError("NOT_FOUND", "One or more tracking items not found or access denied");
      }
    }

    await tx.delete(syncTemplateItems).where(eq(syncTemplateItems.templateId, input.templateId));
    if (input.items.length > 0) {
      await tx.insert(syncTemplateItems).values(
        input.items.map((i) => ({
          templateId: input.templateId,
          trackingItemId: i.trackingItemId,
          orderIdx: i.orderIdx,
        })),
      );
    }
    return { success: true };
  });
}
