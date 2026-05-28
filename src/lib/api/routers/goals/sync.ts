import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { db } from "../../../data";
import {
  attachments,
  connections,
  files,
  goals,
  syncTemplateItems,
  syncTemplates,
  trackingItems,
  weeklySync,
  weeklySyncItems,
} from "../../../data/schema";
import {
  addSyncItemSchema,
  createSyncTemplateSchema,
  createTrackingItemSchema,
  createWeeklySyncSchema,
  removeSyncItemSchema,
  reorderSyncItemsSchema,
  setSyncItemTextSchema,
  setSyncTemplateItemsSchema,
  updateSyncTemplateSchema,
  updateTrackingItemSchema,
  uploadAttachmentSchema,
} from "../../types";
import { decodeImageUpload, decodeUpload, UploadValidationError } from "../../../image-upload";
import { checkRateLimit } from "../../../rate-limit";
import { computeImportance } from "../../../computation/importance";
import { fileUrl } from "./_shared";

export const syncRouter = createTRPCRouter({
  trackingItems: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ goalId: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const conditions = [
          eq(trackingItems.userId, ctx.user.userId),
          isNull(trackingItems.deletedAt),
          eq(trackingItems.status, "active"),
        ];
        if (input?.goalId) conditions.push(eq(trackingItems.goalId, input.goalId));
        return db
          .select()
          .from(trackingItems)
          .where(and(...conditions))
          .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt));
      }),

    create: protectedProcedure.input(createTrackingItemSchema).mutation(async ({ input, ctx }) => {
      // If goalId provided, verify the goal belongs to the user.
      if (input.goalId) {
        const [g] = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (!g) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });
      }
      const [created] = await db
        .insert(trackingItems)
        .values({
          userId: ctx.user.userId,
          goalId: input.goalId ?? null,
          title: input.title,
          description: input.description ?? null,
          order: input.order ?? 0,
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create tracking item" });
      return created;
    }),

    update: protectedProcedure.input(updateTrackingItemSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      // Direct user-scope ownership check — no goal join required.
      const [existing] = await db
        .select()
        .from(trackingItems)
        .where(and(eq(trackingItems.id, id), eq(trackingItems.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tracking item not found or access denied" });
      // If switching/setting goalId, verify the new goal belongs to the user too.
      if (updateData.goalId) {
        const [g] = await db
          .select()
          .from(goals)
          .where(and(eq(goals.id, updateData.goalId), eq(goals.userId, ctx.user.userId)))
          .limit(1);
        if (!g) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found or access denied" });
      }
      const [updated] = await db
        .update(trackingItems)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(trackingItems.id, id))
        .returning();
      return updated;
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(trackingItems)
        .where(and(eq(trackingItems.id, input.id), eq(trackingItems.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tracking item not found or access denied" });
      // Soft-delete if any sync references this item; hard-delete otherwise.
      const [referenced] = await db
        .select({ id: weeklySyncItems.id })
        .from(weeklySyncItems)
        .where(eq(weeklySyncItems.trackingItemId, input.id))
        .limit(1);
      if (referenced) {
        // .returning() so we can detect the silently-empty case (row was hard-
        // deleted between the existence check and this update by a concurrent
        // request, or some other corruption). Better to fail loud than to tell
        // the client "success" while nothing changed.
        const updated = await db
          .update(trackingItems)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(trackingItems.id, input.id))
          .returning({ id: trackingItems.id });
        if (updated.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Tracking item soft-delete touched 0 rows",
          });
        }
        return { success: true, type: "soft_delete" as const };
      }
      await db.delete(trackingItems).where(eq(trackingItems.id, input.id));
      return { success: true, type: "hard_delete" as const };
    }),
  }),

  // Sync Templates — named bundles of tracking items used to instantiate
  // weekly syncs. The default template auto-snapshots into each new sync.
  syncTemplates: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const templates = await db
        .select()
        .from(syncTemplates)
        .where(eq(syncTemplates.userId, ctx.user.userId))
        .orderBy(asc(syncTemplates.createdAt));
      if (templates.length === 0)
        return [] as Array<(typeof templates)[number] & { items: (typeof syncTemplateItems.$inferSelect)[] }>;
      const templateIds = templates.map((t) => t.id);
      const items = await db
        .select()
        .from(syncTemplateItems)
        .where(inArray(syncTemplateItems.templateId, templateIds))
        .orderBy(asc(syncTemplateItems.orderIdx));
      return templates.map((t) => ({
        ...t,
        items: items.filter((i) => i.templateId === t.id),
      }));
    }),

    create: protectedProcedure.input(createSyncTemplateSchema).mutation(async ({ input, ctx }) => {
      // If marking default, clear any existing default first — partial unique
      // index would reject otherwise.
      return await db.transaction(async (tx) => {
        if (input.isDefault) {
          await tx
            .update(syncTemplates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(eq(syncTemplates.userId, ctx.user.userId), eq(syncTemplates.isDefault, true)));
        }
        const [created] = await tx
          .insert(syncTemplates)
          .values({
            userId: ctx.user.userId,
            name: input.name,
            isDefault: input.isDefault ?? false,
          })
          .returning();
        if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create sync template" });
        return created;
      });
    }),

    update: protectedProcedure.input(updateSyncTemplateSchema).mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(syncTemplates)
          .where(and(eq(syncTemplates.id, id), eq(syncTemplates.userId, ctx.user.userId)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found or access denied" });
        if (updateData.isDefault) {
          await tx
            .update(syncTemplates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(and(eq(syncTemplates.userId, ctx.user.userId), eq(syncTemplates.isDefault, true)));
        }
        const [updated] = await tx
          .update(syncTemplates)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(syncTemplates.id, id))
          .returning();
        return updated;
      });
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(syncTemplates)
        .where(and(eq(syncTemplates.id, input.id), eq(syncTemplates.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found or access denied" });
      await db.delete(syncTemplates).where(eq(syncTemplates.id, input.id));
      return { success: true };
    }),

    // Replace-set semantics on the template's item list. Mirror of
    // bucketList.update's personIds[] pattern.
    setItems: protectedProcedure.input(setSyncTemplateItemsSchema).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(syncTemplates)
          .where(and(eq(syncTemplates.id, input.templateId), eq(syncTemplates.userId, ctx.user.userId)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found or access denied" });

        if (input.items.length > 0) {
          const ids = input.items.map((i) => i.trackingItemId);
          const owned = await tx
            .select({ id: trackingItems.id })
            .from(trackingItems)
            .where(and(inArray(trackingItems.id, ids), eq(trackingItems.userId, ctx.user.userId)));
          if (owned.length !== ids.length) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "One or more tracking items not found or access denied",
            });
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
    }),
  }),

  // Weekly Sync — template-driven snapshot at create time, mutable per period.
  weeklySync: createTRPCRouter({
    getByWeek: protectedProcedure.input(z.object({ weekStart: z.date() })).query(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(weeklySync)
        .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, input.weekStart)))
        .limit(1);
      return row ?? null;
    }),

    // Hydrates everything the retro UI needs in one round trip:
    //   - the weeklySync row (or null)
    //   - the user's full tracking-items library (so the "+ add item" picker
    //     can render items not yet on this sync)
    //   - the weekly_sync_items with text_content inline + attachments hydrated
    //   - active goals (for grouping); items with goal_id IS NULL go into
    //     the separate `unscopedItems` array.
    getWeeklyRetrospectiveData: protectedProcedure
      .input(z.object({ weekStart: z.date() }))
      .query(async ({ input, ctx }) => {
        // First batch: independent queries that don't depend on each other —
        // the sync row, the user's active goals, the full tracking-items
        // library. Run them in parallel.
        const [weeklySyncRecord, goalsData, allItems] = await Promise.all([
          db
            .select()
            .from(weeklySync)
            .where(and(eq(weeklySync.userId, ctx.user.userId), eq(weeklySync.weekDate, input.weekStart)))
            .limit(1)
            .then((rows) => rows[0]),
          db
            .select()
            .from(goals)
            .where(and(eq(goals.userId, ctx.user.userId), eq(goals.status, "active"))),
          db
            .select()
            .from(trackingItems)
            .where(
              and(
                eq(trackingItems.userId, ctx.user.userId),
                eq(trackingItems.status, "active"),
                isNull(trackingItems.deletedAt),
              ),
            )
            .orderBy(asc(trackingItems.order), asc(trackingItems.createdAt)),
        ]);

        // Second batch: connections (needs goalsData) and sync-items+attachments
        // (need weeklySyncRecord). Both can run in parallel as well.
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

        // computeImportance reads the same `(source, weight)` shape we already have.

        // Attachments depend on which sync items we got back; one more await.
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
        // Attachments resolve to `/api/files/{fileId}` URLs — the serving
        // route auth-gates by session cookie, no per-render URL signing
        // needed.
        const goalById = new Map(goalsData.map((g) => [g.id, g] as const));
        const itemById = new Map(allItems.map((i) => [i.id, i] as const));

        const hydratedItems = syncItemsData
          .map((si) => {
            const ti = itemById.get(si.trackingItemId);
            if (!ti) return null; // soft-deleted/archived/cross-user — drop
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

        // Group sync items by goal (with an "Unscoped" array for goalId IS NULL).
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
      }),

    // Create a sync for the given week. If templateId is supplied (or omitted
    // and the user has a default template), the sync is auto-populated by
    // snapshotting the template's items in their template-defined order.
    create: protectedProcedure.input(createWeeklySyncSchema).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        let templateId: string | null = input.templateId ?? null;
        if (templateId === null) {
          const [defaultTemplate] = await tx
            .select()
            .from(syncTemplates)
            .where(and(eq(syncTemplates.userId, ctx.user.userId), eq(syncTemplates.isDefault, true)))
            .limit(1);
          templateId = defaultTemplate?.id ?? null;
        } else {
          const [t] = await tx
            .select()
            .from(syncTemplates)
            .where(and(eq(syncTemplates.id, templateId), eq(syncTemplates.userId, ctx.user.userId)))
            .limit(1);
          if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found or access denied" });
        }

        const [created] = await tx
          .insert(weeklySync)
          .values({
            userId: ctx.user.userId,
            weekDate: input.weekDate,
            templateId,
          })
          .returning();
        if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create weekly sync" });

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
    }),

    // Add a single item to an existing sync. Idempotent — returns the existing
    // row if the (sync, item) pair is already there.
    addItem: protectedProcedure.input(addSyncItemSchema).mutation(async ({ input, ctx }) => {
      const [sync] = await db
        .select()
        .from(weeklySync)
        .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);
      if (!sync) throw new TRPCError({ code: "NOT_FOUND", message: "Weekly sync not found or access denied" });
      const [item] = await db
        .select()
        .from(trackingItems)
        .where(and(eq(trackingItems.id, input.trackingItemId), eq(trackingItems.userId, ctx.user.userId)))
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Tracking item not found or access denied" });

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
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to add sync item" });
      return created;
    }),

    // Remove a single item from a sync. Does NOT touch the underlying
    // tracking item (it remains in the user's library). Cascades the item's
    // attachments via FK; we hand-remove the storage objects after.
    removeItem: protectedProcedure.input(removeSyncItemSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ syncItemId: weeklySyncItems.id })
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(and(eq(weeklySyncItems.id, input.weeklySyncItemId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sync item not found or access denied" });

      // Attachments are polymorphic — no FK from attachments.parentId to
      // weeklySyncItems.id, so we have to hand-delete them. attachments →
      // files cascades on fileId, so the file blob goes away with the row.
      await db
        .delete(attachments)
        .where(and(eq(attachments.parentType, "weekly_sync_item"), eq(attachments.parentId, input.weeklySyncItemId)));
      await db.delete(weeklySyncItems).where(eq(weeklySyncItems.id, input.weeklySyncItemId));
      return { success: true };
    }),

    setItemText: protectedProcedure.input(setSyncItemTextSchema).mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select({ id: weeklySyncItems.id })
        .from(weeklySyncItems)
        .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
        .where(and(eq(weeklySyncItems.id, input.weeklySyncItemId), eq(weeklySync.userId, ctx.user.userId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sync item not found or access denied" });
      await db
        .update(weeklySyncItems)
        .set({ textContent: input.textContent, updatedAt: new Date() })
        .where(eq(weeklySyncItems.id, input.weeklySyncItemId));
      return { success: true };
    }),

    reorderItems: protectedProcedure.input(reorderSyncItemsSchema).mutation(async ({ input, ctx }) => {
      return await db.transaction(async (tx) => {
        const [sync] = await tx
          .select()
          .from(weeklySync)
          .where(and(eq(weeklySync.id, input.weeklySyncId), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);
        if (!sync) throw new TRPCError({ code: "NOT_FOUND", message: "Sync not found or access denied" });

        const ids = input.ordering.map((o) => o.id);
        if (ids.length > 0) {
          const owned = await tx
            .select({ id: weeklySyncItems.id })
            .from(weeklySyncItems)
            .where(and(eq(weeklySyncItems.weeklySyncId, input.weeklySyncId), inArray(weeklySyncItems.id, ids)));
          if (owned.length !== ids.length) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ordering references items not in this sync" });
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
    }),
  }),

  // Generic polymorphic attachments — replaces the old weeklySyncItemFiles
  // routes. parent_type='weekly_sync_item' is the only producer today, but
  // the schema is permissive so other entities can opt in without migration.
  attachments: createTRPCRouter({
    upload: protectedProcedure.input(uploadAttachmentSchema).mutation(async ({ input, ctx }) => {
      // 30 attachments per minute per user — generous for batch uploads,
      // tight enough that a runaway loop bails before quota.
      const rl = checkRateLimit("attachments.upload", `user:${ctx.user.userId}`, { limit: 30, windowMs: 60_000 });
      if (!rl.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many uploads, slow down" });
      }
      // Validate ownership of the parent. Only weekly_sync_item is supported today;
      // adding more parent types means extending this switch.
      if (input.parentType === "weekly_sync_item") {
        const [owned] = await db
          .select({ id: weeklySyncItems.id })
          .from(weeklySyncItems)
          .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
          .where(and(eq(weeklySyncItems.id, input.parentId), eq(weeklySync.userId, ctx.user.userId)))
          .limit(1);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Sync item not found or access denied" });
      }

      // Decode + validate (size, image magic-bytes if fileType=image). Throws
      // UploadValidationError on bad input — convert to user-facing Error.
      let decoded;
      try {
        decoded = input.fileType === "image" ? decodeImageUpload(input.data) : decodeUpload(input.data);
      } catch (err) {
        if (err instanceof UploadValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
      const contentType = decoded.mime ?? "application/octet-stream";
      const sizeBytes = decoded.buffer.length;

      // Insert the file blob, then the attachment metadata row pointing at it.
      // attachments.fileId cascades file deletion, so a future attachments
      // delete sweeps the bytes with it.
      const [file] = await db
        .insert(files)
        .values({
          ownerId: ctx.user.userId,
          fileName: input.fileName,
          mimeType: contentType,
          sizeBytes,
          data: decoded.buffer,
        })
        .returning({ id: files.id });
      if (!file) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to store attachment bytes" });

      let row: typeof attachments.$inferSelect | undefined;
      try {
        [row] = await db
          .insert(attachments)
          .values({
            userId: ctx.user.userId,
            parentType: input.parentType,
            parentId: input.parentId,
            fileName: input.fileName,
            fileType: input.fileType,
            fileId: file.id,
            sizeBytes,
          })
          .returning();
      } catch (err) {
        // Roll back the file blob so we don't leave an orphan if the
        // metadata insert fails (DB constraint, race, etc).
        await db.delete(files).where(eq(files.id, file.id));
        throw err;
      }
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create attachment row" });

      return {
        id: row.id,
        fileName: row.fileName,
        fileType: row.fileType,
        url: fileUrl(file.id),
        sizeBytes,
        createdAt: row.createdAt,
      };
    }),

    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, input.id), eq(attachments.userId, ctx.user.userId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found or access denied" });
      // attachments.fileId cascades to files.id — one delete removes both rows.
      await db.delete(attachments).where(eq(attachments.id, input.id));
      return { success: true };
    }),
  }),

  // Data operations (for importing/exporting)
});
