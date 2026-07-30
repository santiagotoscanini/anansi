// Things the user wants to do before they die. Flat, user-scoped list, with an
// optional set of people they want to do each one with.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "~/lib/data";
import { bucketListItemPeople, bucketListItems } from "~/lib/data/schema";
import type { CreateBucketListItem, UpdateBucketListItem } from "~/lib/api/types";
import { AppError } from "./errors";

export async function list(userId: string) {
  const items = await db
    .select()
    .from(bucketListItems)
    .where(eq(bucketListItems.userId, userId))
    .orderBy(asc(bucketListItems.createdAt));
  if (items.length === 0) return [] as ((typeof items)[number] & { personIds: string[] })[];

  // Hydrate person links in a single query, then group by item id.
  const links = await db
    .select()
    .from(bucketListItemPeople)
    .where(
      inArray(
        bucketListItemPeople.bucketItemId,
        items.map((i) => i.id),
      ),
    );
  return items.map((it) => ({
    ...it,
    personIds: links.filter((l) => l.bucketItemId === it.id).map((l) => l.personId),
  }));
}

export async function create(userId: string, input: CreateBucketListItem) {
  const [created] = await db
    .insert(bucketListItems)
    .values({
      content: input.content,
      description: input.description ?? null,
      userId,
    })
    .returning();
  if (!created) throw new AppError("INTERNAL_SERVER_ERROR", "Failed to create item");
  if (input.personIds?.length) {
    await db
      .insert(bucketListItemPeople)
      .values(input.personIds.map((personId) => ({ bucketItemId: created.id, personId })));
  }
  return created;
}

export async function update(userId: string, input: UpdateBucketListItem) {
  const [updated] = await db
    .update(bucketListItems)
    .set({
      content: input.content,
      description: input.description ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, userId)))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Item not found or access denied");

  // Replace the person link set if the caller provided one. `undefined` = leave unchanged.
  if (input.personIds !== undefined) {
    await db.delete(bucketListItemPeople).where(eq(bucketListItemPeople.bucketItemId, input.id));
    if (input.personIds.length > 0) {
      await db
        .insert(bucketListItemPeople)
        .values(input.personIds.map((personId) => ({ bucketItemId: input.id, personId })));
    }
  }
  return updated;
}

/**
 * `completed: true` marks done (sets completedAt = now); `false` marks it
 * pending again (clears completedAt).
 */
export async function toggleCompleted(userId: string, input: { id: string; completed: boolean }) {
  const [updated] = await db
    .update(bucketListItems)
    .set({
      completedAt: input.completed ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, userId)))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND", "Item not found or access denied");
  return updated;
}

export async function remove(userId: string, id: string) {
  await db.delete(bucketListItems).where(and(eq(bucketListItems.id, id), eq(bucketListItems.userId, userId)));
  return { success: true };
}
