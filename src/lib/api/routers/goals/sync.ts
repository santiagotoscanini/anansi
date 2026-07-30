// Transport only. Logic lives in
// src/server/services/{tracking-items,sync-templates,weekly-sync,attachments}.ts.
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
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
import * as attachmentsService from "~/server/services/attachments";
import * as syncTemplatesService from "~/server/services/sync-templates";
import * as trackingItemsService from "~/server/services/tracking-items";
import * as weeklySyncService from "~/server/services/weekly-sync";

const idInput = z.object({ id: z.string() });
const weekStartInput = z.object({ weekStart: z.date() });

export const syncRouter = createTRPCRouter({
  trackingItems: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ goalId: z.string().optional() }).optional())
      .query(({ input, ctx }) => trackingItemsService.list(ctx.user.userId, input)),

    create: protectedProcedure
      .input(createTrackingItemSchema)
      .mutation(({ input, ctx }) => trackingItemsService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateTrackingItemSchema)
      .mutation(({ input, ctx }) => trackingItemsService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => trackingItemsService.remove(ctx.user.userId, input.id)),
  }),

  syncTemplates: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => syncTemplatesService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createSyncTemplateSchema)
      .mutation(({ input, ctx }) => syncTemplatesService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateSyncTemplateSchema)
      .mutation(({ input, ctx }) => syncTemplatesService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => syncTemplatesService.remove(ctx.user.userId, input.id)),

    setItems: protectedProcedure
      .input(setSyncTemplateItemsSchema)
      .mutation(({ input, ctx }) => syncTemplatesService.setItems(ctx.user.userId, input)),
  }),

  weeklySync: createTRPCRouter({
    getByWeek: protectedProcedure
      .input(weekStartInput)
      .query(({ input, ctx }) => weeklySyncService.getByWeek(ctx.user.userId, input.weekStart)),

    getWeeklyRetrospectiveData: protectedProcedure
      .input(weekStartInput)
      .query(({ input, ctx }) => weeklySyncService.getWeeklyRetrospectiveData(ctx.user.userId, input.weekStart)),

    create: protectedProcedure
      .input(createWeeklySyncSchema)
      .mutation(({ input, ctx }) => weeklySyncService.create(ctx.user.userId, input)),

    addItem: protectedProcedure
      .input(addSyncItemSchema)
      .mutation(({ input, ctx }) => weeklySyncService.addItem(ctx.user.userId, input)),

    removeItem: protectedProcedure
      .input(removeSyncItemSchema)
      .mutation(({ input, ctx }) => weeklySyncService.removeItem(ctx.user.userId, input)),

    setItemText: protectedProcedure
      .input(setSyncItemTextSchema)
      .mutation(({ input, ctx }) => weeklySyncService.setItemText(ctx.user.userId, input)),

    reorderItems: protectedProcedure
      .input(reorderSyncItemsSchema)
      .mutation(({ input, ctx }) => weeklySyncService.reorderItems(ctx.user.userId, input)),
  }),

  attachments: createTRPCRouter({
    upload: protectedProcedure
      .input(uploadAttachmentSchema)
      .mutation(({ input, ctx }) => attachmentsService.upload(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => attachmentsService.remove(ctx.user.userId, input.id)),
  }),
});
