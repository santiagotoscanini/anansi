import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { db } from "../../../data";
import { goalValues, valueBehaviors, values } from "../../../data/schema";
import { createValueBehaviorSchema, createValueSchema, updateValueSchema } from "../../types";

export const valuesRouter = createTRPCRouter({
  values: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db.select().from(values).where(eq(values.userId, ctx.user.userId));
    }),

    create: protectedProcedure.input(createValueSchema).mutation(async ({ input, ctx }) => {
      const [newValue] = await db
        .insert(values)
        .values({ ...input, userId: ctx.user.userId })
        .returning();
      if (!newValue) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create value" });
      }
      return newValue;
    }),

    update: protectedProcedure.input(updateValueSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      const [updatedValue] = await db
        .update(values)
        .set({ ...updateData, updatedAt: new Date() })
        .where(and(eq(values.id, id), eq(values.userId, ctx.user.userId)))
        .returning();
      return updatedValue;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db.delete(goalValues).where(eq(goalValues.valueId, input.id));
      await db.delete(values).where(and(eq(values.id, input.id), eq(values.userId, ctx.user.userId)));
      return { success: true };
    }),
  }),

  // Behaviors that confirm a value — concrete evidence per value.
  // Ownership is enforced via the parent value's user_id (no direct user_id
  // on value_behaviors; cascade-deletes when the value goes away).
  valueBehaviors: createTRPCRouter({
    list: protectedProcedure.input(z.object({ valueId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the value belongs to the caller before returning behaviors.
      const [value] = await db
        .select()
        .from(values)
        .where(and(eq(values.id, input.valueId), eq(values.userId, ctx.user.userId)))
        .limit(1);
      if (!value) throw new TRPCError({ code: "NOT_FOUND", message: "Value not found or access denied" });
      return await db
        .select()
        .from(valueBehaviors)
        .where(eq(valueBehaviors.valueId, input.valueId))
        .orderBy(asc(valueBehaviors.orderIdx), asc(valueBehaviors.createdAt));
    }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      // Returns every behavior across all of the user's values — used by the
      // ValuesManager to render counts + the inline expansion in one round trip.
      return await db
        .select({
          id: valueBehaviors.id,
          valueId: valueBehaviors.valueId,
          content: valueBehaviors.content,
          orderIdx: valueBehaviors.orderIdx,
          createdAt: valueBehaviors.createdAt,
        })
        .from(valueBehaviors)
        .innerJoin(values, eq(valueBehaviors.valueId, values.id))
        .where(eq(values.userId, ctx.user.userId))
        .orderBy(asc(valueBehaviors.orderIdx), asc(valueBehaviors.createdAt));
    }),

    create: protectedProcedure.input(createValueBehaviorSchema).mutation(async ({ input, ctx }) => {
      const [value] = await db
        .select()
        .from(values)
        .where(and(eq(values.id, input.valueId), eq(values.userId, ctx.user.userId)))
        .limit(1);
      if (!value) throw new TRPCError({ code: "NOT_FOUND", message: "Value not found or access denied" });

      // Append at the end of the value's behavior list.
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${valueBehaviors.orderIdx}), -1)` })
        .from(valueBehaviors)
        .where(eq(valueBehaviors.valueId, input.valueId));
      const nextOrder = (maxRow?.max ?? -1) + 1;

      const [created] = await db
        .insert(valueBehaviors)
        .values({ valueId: input.valueId, content: input.content, orderIdx: nextOrder })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to add behavior" });
      return created;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      // Ownership via the parent value.
      const [row] = await db
        .select({ id: valueBehaviors.id })
        .from(valueBehaviors)
        .innerJoin(values, eq(valueBehaviors.valueId, values.id))
        .where(and(eq(valueBehaviors.id, input.id), eq(values.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Behavior not found or access denied" });
      await db.delete(valueBehaviors).where(eq(valueBehaviors.id, input.id));
      return { success: true };
    }),
  }),

  // Goals operations
});
