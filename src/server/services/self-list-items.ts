// Atomic rows for every list-shaped section on the Self page (energizers,
// drainers, just-for-me, proud, patterns, triggers, releases, year-ahead).
//
// One table for all kinds keeps the surface small; the UI groups by `kind`, and
// by `patternCategory` when kind = 'pattern'. The server is what enforces that
// patternCategory is only meaningful for patterns — never trust the client's.
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "~/lib/data";
import { selfListItems } from "~/lib/data/schema";
import type { CreateSelfListItem, ReorderSelfListItems, UpdateSelfListItem } from "~/lib/api/types";
import { AppError } from "./errors";

export async function list(userId: string) {
  return await db
    .select()
    .from(selfListItems)
    .where(eq(selfListItems.userId, userId))
    .orderBy(asc(selfListItems.kind), asc(selfListItems.orderIdx), asc(selfListItems.createdAt));
}

export async function create(userId: string, input: CreateSelfListItem) {
  // Append: new items land at the end of their kind's list.
  const aggRows = await db
    .select({ maxIdx: sql<number>`COALESCE(MAX(${selfListItems.orderIdx}), -1)` })
    .from(selfListItems)
    .where(and(eq(selfListItems.userId, userId), eq(selfListItems.kind, input.kind)));
  const nextOrderIdx = (aggRows[0]?.maxIdx ?? -1) + 1;

  const [created] = await db
    .insert(selfListItems)
    .values({
      userId,
      kind: input.kind,
      // pattern_category only meaningful when kind = 'pattern'; null everywhere
      // else regardless of what the client sent.
      patternCategory: input.kind === "pattern" ? (input.patternCategory ?? null) : null,
      content: input.content,
      orderIdx: nextOrderIdx,
    })
    .returning();
  return created;
}

export async function update(userId: string, input: UpdateSelfListItem) {
  const [row] = await db
    .select()
    .from(selfListItems)
    .where(and(eq(selfListItems.id, input.id), eq(selfListItems.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Self list item not found or access denied");

  const patch: { content?: string; patternCategory?: typeof row.patternCategory; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.content !== undefined) patch.content = input.content;
  if (input.patternCategory !== undefined) {
    // Re-derive from the stored kind, not the client's claim.
    patch.patternCategory = row.kind === "pattern" ? (input.patternCategory ?? null) : null;
  }

  const [updated] = await db.update(selfListItems).set(patch).where(eq(selfListItems.id, input.id)).returning();
  return updated;
}

export async function remove(userId: string, id: string) {
  await db.delete(selfListItems).where(and(eq(selfListItems.id, id), eq(selfListItems.userId, userId)));
  return { success: true };
}

export async function reorder(userId: string, input: ReorderSelfListItems) {
  // Atomic re-numbering. Each row update is gated on userId + kind so a forged
  // id from another kind or another user is a no-op rather than a bypass.
  await db.transaction(async (tx) => {
    for (const { id, orderIdx } of input.ordering) {
      await tx
        .update(selfListItems)
        .set({ orderIdx, updatedAt: new Date() })
        .where(and(eq(selfListItems.id, id), eq(selfListItems.userId, userId), eq(selfListItems.kind, input.kind)));
    }
  });
  return { success: true };
}
