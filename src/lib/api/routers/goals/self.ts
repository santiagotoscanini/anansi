import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { db } from "../../../data";
import { selfListItems, userSelf } from "../../../data/schema";
import {
  createSelfListItemSchema,
  reorderSelfListItemsSchema,
  updateSelfListItemSchema,
  updateSelfSchema,
} from "../../types";

export const selfRouter = createTRPCRouter({
  self: createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
      const [row] = await db.select().from(userSelf).where(eq(userSelf.userId, ctx.user.userId)).limit(1);
      return row ?? null;
    }),

    update: protectedProcedure.input(updateSelfSchema).mutation(async ({ input, ctx }) => {
      const userId = ctx.user.userId;
      const [existing] = await db.select().from(userSelf).where(eq(userSelf.userId, userId)).limit(1);
      if (existing) {
        const [updated] = await db
          .update(userSelf)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(userSelf.userId, userId))
          .returning();
        return updated;
      }
      const [created] = await db
        .insert(userSelf)
        .values({ ...input, userId })
        .returning();
      return created;
    }),
  }),

  // Self list items — atomic rows for every list-shaped section on the Self
  // page (energizers, drainers, just-for-me, patterns, triggers, releases,
  // year-ahead). One table for all kinds keeps the surface small; the UI
  // groups by `kind` (and by `patternCategory` when kind = 'pattern').
  selfListItems: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db
        .select()
        .from(selfListItems)
        .where(eq(selfListItems.userId, ctx.user.userId))
        .orderBy(asc(selfListItems.kind), asc(selfListItems.orderIdx), asc(selfListItems.createdAt));
    }),

    create: protectedProcedure.input(createSelfListItemSchema).mutation(async ({ input, ctx }) => {
      const userId = ctx.user.userId;
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
          // pattern_category only meaningful when kind = 'pattern'; null
          // everywhere else regardless of what the client sent.
          patternCategory: input.kind === "pattern" ? (input.patternCategory ?? null) : null,
          content: input.content,
          orderIdx: nextOrderIdx,
        })
        .returning();
      return created;
    }),

    update: protectedProcedure.input(updateSelfListItemSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(selfListItems)
        .where(and(eq(selfListItems.id, input.id), eq(selfListItems.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Self list item not found or access denied" });
      const patch: { content?: string; patternCategory?: typeof row.patternCategory; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (input.content !== undefined) patch.content = input.content;
      if (input.patternCategory !== undefined) {
        patch.patternCategory = row.kind === "pattern" ? (input.patternCategory ?? null) : null;
      }
      const [updated] = await db.update(selfListItems).set(patch).where(eq(selfListItems.id, input.id)).returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db
        .delete(selfListItems)
        .where(and(eq(selfListItems.id, input.id), eq(selfListItems.userId, ctx.user.userId)));
      return { success: true };
    }),

    reorder: protectedProcedure.input(reorderSelfListItemsSchema).mutation(async ({ input, ctx }) => {
      const userId = ctx.user.userId;
      // Atomic re-numbering. Each row update is gated on userId + kind so a
      // forged id from another kind/user is a no-op rather than a bypass.
      await db.transaction(async (tx) => {
        for (const { id, orderIdx } of input.ordering) {
          await tx
            .update(selfListItems)
            .set({ orderIdx, updatedAt: new Date() })
            .where(and(eq(selfListItems.id, id), eq(selfListItems.userId, userId), eq(selfListItems.kind, input.kind)));
        }
      });
      return { success: true };
    }),
  }),

  // Bids (formerly "gift ideas") — per-person list of actionable improvements
  // to the relationship. Each bid can have an optional deadline (`dueAt`) and a
  // completion timestamp (`completedAt`). Completed bids stay visible.
});
