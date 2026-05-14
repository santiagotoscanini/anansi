import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { db } from "../../../data";
import {
  bucketListItemPeople,
  bucketListItems,
  goals,
  importantDates,
  nextBids,
  people,
  peopleToGroups,
  personGroups,
  taskReferents,
  tasks,
  tasksToGroups,
} from "../../../data/schema";
import {
  createBucketListItemSchema,
  createImportantDateSchema,
  createNextBidSchema,
  createPersonGroupSchema,
  createPersonSchema,
  personCategoryValues,
  setNextBidCompletedSchema,
  updateBucketListItemSchema,
  updateImportantDateSchema,
  updateNextBidSchema,
  updatePersonGroupSchema,
  updatePersonSchema,
} from "../../types";
import { decodeImageUpload, UploadValidationError } from "../../../image-upload";
import { checkRateLimit } from "../../../rate-limit";
import { createId } from "@paralleldrive/cuid2";
import { PEOPLE_PHOTOS_BUCKET, safeExtension } from "./_shared";
import { createServiceRoleClient } from "../../../supabase/service";

export const peopleRouter = createTRPCRouter({
  people: createTRPCRouter({
    getAll: protectedProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const rows = await db.select().from(people).where(eq(people.userId, ctx.user.userId));
        const visible = input?.includeArchived ? rows : rows.filter((p) => p.archivedAt === null);
        if (visible.length === 0) return [] as ((typeof rows)[number] & { groupIds: string[] })[];

        // Hydrate group memberships so the directory can render group chips
        // without a per-row query.
        const memberships = await db
          .select()
          .from(peopleToGroups)
          .where(
            inArray(
              peopleToGroups.personId,
              visible.map((p) => p.id),
            ),
          );
        return visible.map((p) => ({
          ...p,
          groupIds: memberships.filter((m) => m.personId === p.id).map((m) => m.groupId),
        }));
      }),

    getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
      const [row] = await db
        .select()
        .from(people)
        .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) return null;
      const memberships = await db.select().from(peopleToGroups).where(eq(peopleToGroups.personId, row.id));
      return { ...row, groupIds: memberships.map((m) => m.groupId) };
    }),

    create: protectedProcedure.input(createPersonSchema).mutation(async ({ input, ctx }) => {
      const { groupIds, ...rest } = input;
      const [newPerson] = await db
        .insert(people)
        .values({ ...rest, userId: ctx.user.userId })
        .returning();
      if (!newPerson) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create person" });
      if (groupIds?.length) {
        await db.insert(peopleToGroups).values(groupIds.map((groupId) => ({ personId: newPerson.id, groupId })));
      }
      return newPerson;
    }),

    update: protectedProcedure.input(updatePersonSchema).mutation(async ({ input, ctx }) => {
      const { id, groupIds, ...updateData } = input;
      const [updated] = await db
        .update(people)
        .set({ ...updateData, updatedAt: new Date() })
        .where(and(eq(people.id, id), eq(people.userId, ctx.user.userId)))
        .returning();

      if (groupIds !== undefined) {
        await db.delete(peopleToGroups).where(eq(peopleToGroups.personId, id));
        if (groupIds.length > 0) {
          await db.insert(peopleToGroups).values(groupIds.map((groupId) => ({ personId: id, groupId })));
        }
      }
      return updated;
    }),

    archive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(people)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
        .returning();
      return updated;
    }),

    unarchive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(people)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db.delete(people).where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)));
      return { success: true };
    }),

    // Lightweight drag-drop endpoint — updates only category + boardOrder without
    // requiring the full person payload, and without triggering validation on the
    // other reflection fields.
    setCategory: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          category: z.enum(personCategoryValues),
          boardOrder: z.number().int().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const [updated] = await db
          .update(people)
          .set({
            category: input.category,
            boardOrder: input.boardOrder ?? 0,
            updatedAt: new Date(),
          })
          .where(and(eq(people.id, input.id), eq(people.userId, ctx.user.userId)))
          .returning();
        return updated;
      }),

    // Tasks where this person is a referent — used by PersonModal to show the
    // action surface alongside the reflection fields.
    getTasksAsReferent: protectedProcedure.input(z.object({ personId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the person belongs to the user (prevents enumeration via task refs).
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) return [];

      const rows = await db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          completed: tasks.completed,
          goalId: goals.id,
          goalTitle: goals.title,
          goalEmoji: goals.emoji,
        })
        .from(taskReferents)
        .innerJoin(tasks, eq(taskReferents.taskId, tasks.id))
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(
          and(
            eq(taskReferents.personId, input.personId),
            eq(goals.userId, ctx.user.userId),
            eq(goals.status, "active"),
          ),
        );
      return rows;
    }),

    // Upload a picture for a person. Writes to the public `people-photos`
    // Supabase Storage bucket at `{userId}/{id}.{ext}` (id is fresh per
    // upload, so old files become orphans rather than being overwritten —
    // acceptable trade-off for a personal app). RLS enforces that only the
    // owning user can write under their folder. Returns the public URL so
    // the caller can stash it in `people.emoji` (the column already accepts
    // URL-typed values via Avatar.tsx).
    uploadImage: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(255),
          // base64; data: prefix permitted but not required. Size + magic-byte validated below.
          data: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const rl = checkRateLimit("people.uploadImage", `user:${ctx.user.userId}`, { limit: 20, windowMs: 60_000 });
        if (!rl.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many uploads, slow down" });
        }
        let decoded;
        try {
          decoded = decodeImageUpload(input.data);
        } catch (err) {
          if (err instanceof UploadValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          throw err;
        }
        const ext = safeExtension(input.fileName, decoded.mime);
        const id = createId();
        const objectPath = `${ctx.user.userId}/${id}${ext}`;
        const contentType = decoded.mime ?? "application/octet-stream";

        const supabase = createServiceRoleClient();
        const { error: uploadError } = await supabase.storage
          .from(PEOPLE_PHOTOS_BUCKET)
          .upload(objectPath, decoded.buffer, { contentType });
        if (uploadError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: uploadError.message });
        }
        const { data: publicUrl } = supabase.storage.from(PEOPLE_PHOTOS_BUCKET).getPublicUrl(objectPath);
        return { url: publicUrl.publicUrl };
      }),

    // Bucket list items the person is named on. Mirror of getTasksAsReferent — used
    // by PersonModal to surface the cross-link from the People side.
    getBucketListItemsAsParticipant: protectedProcedure
      .input(z.object({ personId: z.string() }))
      .query(async ({ input, ctx }) => {
        // Verify the person belongs to the user (prevents enumeration via junction rows).
        const [person] = await db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
          .limit(1);
        if (!person) return [];

        const rows = await db
          .select({
            id: bucketListItems.id,
            content: bucketListItems.content,
            completedAt: bucketListItems.completedAt,
          })
          .from(bucketListItemPeople)
          .innerJoin(bucketListItems, eq(bucketListItemPeople.bucketItemId, bucketListItems.id))
          .where(and(eq(bucketListItemPeople.personId, input.personId), eq(bucketListItems.userId, ctx.user.userId)))
          .orderBy(asc(bucketListItems.createdAt));
        return rows;
      }),
  }),

  // Person groups — user-defined tags. A person can belong to any number of
  // groups. Groups are scoped per-user.
  groups: createTRPCRouter({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db
        .select()
        .from(personGroups)
        .where(eq(personGroups.userId, ctx.user.userId))
        .orderBy(asc(personGroups.orderIdx), asc(personGroups.createdAt));
    }),

    create: protectedProcedure.input(createPersonGroupSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .insert(personGroups)
        .values({ ...input, userId: ctx.user.userId })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create group" });
      return row;
    }),

    update: protectedProcedure.input(updatePersonGroupSchema).mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      const [updated] = await db
        .update(personGroups)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(personGroups.id, id), eq(personGroups.userId, ctx.user.userId)))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db.delete(personGroups).where(and(eq(personGroups.id, input.id), eq(personGroups.userId, ctx.user.userId)));
      return { success: true };
    }),

    // Tasks tagged with a group, joined with goal context. Used by the group
    // filter view to surface tasks alongside people. Ownership enforced via
    // the parent goal — and via the group's userId for the membership row.
    getTasks: protectedProcedure.input(z.object({ groupId: z.string() })).query(async ({ input, ctx }) => {
      const [group] = await db
        .select({ id: personGroups.id })
        .from(personGroups)
        .where(and(eq(personGroups.id, input.groupId), eq(personGroups.userId, ctx.user.userId)))
        .limit(1);
      if (!group) return [];

      const rows = await db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          completed: tasks.completed,
          difficulty: tasks.difficulty,
          scheduledAt: tasks.scheduledAt,
          goalId: goals.id,
          goalTitle: goals.title,
          goalEmoji: goals.emoji,
        })
        .from(tasksToGroups)
        .innerJoin(tasks, eq(tasksToGroups.taskId, tasks.id))
        .innerJoin(goals, eq(tasks.goalId, goals.id))
        .where(
          and(eq(tasksToGroups.groupId, input.groupId), eq(goals.userId, ctx.user.userId), eq(goals.status, "active")),
        );
      return rows;
    }),
  }),

  // Self space — one row per user, distinct from a Person
  nextBids: createTRPCRouter({
    list: protectedProcedure.input(z.object({ personId: z.string() })).query(async ({ input, ctx }) => {
      // Verify the person belongs to the user before returning rows.
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) return [];
      return db.select().from(nextBids).where(eq(nextBids.personId, input.personId)).orderBy(asc(nextBids.createdAt));
    }),

    create: protectedProcedure.input(createNextBidSchema).mutation(async ({ input, ctx }) => {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found or access denied" });
      const [created] = await db
        .insert(nextBids)
        .values({
          personId: input.personId,
          content: input.content,
          dueAt: input.dueAt ?? null,
        })
        .returning();
      return created;
    }),

    update: protectedProcedure.input(updateNextBidSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: nextBids.id })
        .from(nextBids)
        .innerJoin(people, eq(nextBids.personId, people.id))
        .where(and(eq(nextBids.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found or access denied" });
      const patch: { content?: string; dueAt?: Date | null } = {};
      if (input.content !== undefined) patch.content = input.content;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
      const [updated] = await db.update(nextBids).set(patch).where(eq(nextBids.id, input.id)).returning();
      return updated;
    }),

    setCompleted: protectedProcedure.input(setNextBidCompletedSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: nextBids.id })
        .from(nextBids)
        .innerJoin(people, eq(nextBids.personId, people.id))
        .where(and(eq(nextBids.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found or access denied" });
      const [updated] = await db
        .update(nextBids)
        .set({ completedAt: input.completed ? new Date() : null })
        .where(eq(nextBids.id, input.id))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      // Verify ownership via JOIN through people, then delete by id.
      const [row] = await db
        .select({ id: nextBids.id })
        .from(nextBids)
        .innerJoin(people, eq(nextBids.personId, people.id))
        .where(and(eq(nextBids.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found or access denied" });
      await db.delete(nextBids).where(eq(nextBids.id, input.id));
      return { success: true };
    }),

    // All upcoming open bids across the user's people, joined with the
    // person's name + emoji for inline rendering. Drives the unified
    // Pulse "Upcoming" feed. `withinDays` defaults to 60 — wider than
    // important dates (30) so bids that don't have a tight deadline still
    // surface as time approaches.
    listUpcoming: protectedProcedure
      .input(z.object({ withinDays: z.number().int().min(1).max(365).default(60) }).optional())
      .query(async ({ input, ctx }) => {
        const days = input?.withinDays ?? 60;
        const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const rows = await db
          .select({
            id: nextBids.id,
            personId: nextBids.personId,
            content: nextBids.content,
            dueAt: nextBids.dueAt,
            completedAt: nextBids.completedAt,
            personName: people.name,
            personEmoji: people.emoji,
          })
          .from(nextBids)
          .innerJoin(people, eq(nextBids.personId, people.id))
          .where(and(eq(people.userId, ctx.user.userId), isNull(nextBids.completedAt), isNull(people.archivedAt)))
          .orderBy(asc(nextBids.dueAt));
        // Drizzle doesn't have a tidy "between" for nullable + bound, so
        // filter in JS — small N (per user, open bids only).
        return rows.filter((r) => r.dueAt !== null && r.dueAt.getTime() <= cutoff.getTime());
      }),
  }),

  // Important dates — yearly recurring (birthday, anniversary, …). Per-person.
  importantDates: createTRPCRouter({
    list: protectedProcedure.input(z.object({ personId: z.string() }).optional()).query(async ({ input, ctx }) => {
      if (input?.personId) {
        const [person] = await db
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
          .limit(1);
        if (!person) return [];
        return db
          .select()
          .from(importantDates)
          .where(eq(importantDates.personId, input.personId))
          .orderBy(asc(importantDates.month), asc(importantDates.day));
      }
      // No personId: return everything for this user across all their people.
      return db
        .select({
          id: importantDates.id,
          personId: importantDates.personId,
          label: importantDates.label,
          month: importantDates.month,
          day: importantDates.day,
          year: importantDates.year,
          createdAt: importantDates.createdAt,
          updatedAt: importantDates.updatedAt,
        })
        .from(importantDates)
        .innerJoin(people, eq(importantDates.personId, people.id))
        .where(eq(people.userId, ctx.user.userId))
        .orderBy(asc(importantDates.month), asc(importantDates.day));
    }),

    create: protectedProcedure.input(createImportantDateSchema).mutation(async ({ input, ctx }) => {
      const [person] = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found or access denied" });
      const [created] = await db
        .insert(importantDates)
        .values({
          personId: input.personId,
          label: input.label,
          month: input.month,
          day: input.day,
          year: input.year ?? null,
        })
        .returning();
      return created;
    }),

    update: protectedProcedure.input(updateImportantDateSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: importantDates.id })
        .from(importantDates)
        .innerJoin(people, eq(importantDates.personId, people.id))
        .where(and(eq(importantDates.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Important date not found or access denied" });
      const patch: { label?: string; month?: number; day?: number; year?: number | null; updatedAt?: Date } = {
        updatedAt: new Date(),
      };
      if (input.label !== undefined) patch.label = input.label;
      if (input.month !== undefined) patch.month = input.month;
      if (input.day !== undefined) patch.day = input.day;
      if (input.year !== undefined) patch.year = input.year;
      const [updated] = await db.update(importantDates).set(patch).where(eq(importantDates.id, input.id)).returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: importantDates.id })
        .from(importantDates)
        .innerJoin(people, eq(importantDates.personId, people.id))
        .where(and(eq(importantDates.id, input.id), eq(people.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Important date not found or access denied" });
      await db.delete(importantDates).where(eq(importantDates.id, input.id));
      return { success: true };
    }),
  }),

  // Bucket list — things the user wants to do before dying. Flat list, user-scoped.
  bucketList: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const items = await db
        .select()
        .from(bucketListItems)
        .where(eq(bucketListItems.userId, ctx.user.userId))
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
    }),

    create: protectedProcedure.input(createBucketListItemSchema).mutation(async ({ input, ctx }) => {
      const [created] = await db
        .insert(bucketListItems)
        .values({
          content: input.content,
          description: input.description ?? null,
          userId: ctx.user.userId,
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create item" });
      if (input.personIds?.length) {
        await db
          .insert(bucketListItemPeople)
          .values(input.personIds.map((personId) => ({ bucketItemId: created.id, personId })));
      }
      return created;
    }),

    update: protectedProcedure.input(updateBucketListItemSchema).mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(bucketListItems)
        .set({
          content: input.content,
          description: input.description ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, ctx.user.userId)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found or access denied" });

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
    }),

    // Toggle completion: pass `completed: true` to mark done (sets completedAt = now),
    // `false` to mark pending again (clears completedAt).
    toggleCompleted: protectedProcedure
      .input(z.object({ id: z.string(), completed: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const [updated] = await db
          .update(bucketListItems)
          .set({
            completedAt: input.completed ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, ctx.user.userId)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found or access denied" });
        return updated;
      }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      await db
        .delete(bucketListItems)
        .where(and(eq(bucketListItems.id, input.id), eq(bucketListItems.userId, ctx.user.userId)));
      return { success: true };
    }),
  }),

  // Full-fidelity backup — exports everything the user owns (DB + files);
  // import wipes the user's data wholesale inside a tx, then rewrites files
  // under the new caller's userId. Schema is strict — no back-compat shims.
});
