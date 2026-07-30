// Transport only. Logic lives in
// src/server/services/{people,groups,next-bids,important-dates,bucket-list}.ts.
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../../trpc'
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
} from '../../types'
import * as bucketListService from '~/server/services/bucket-list'
import * as groupsService from '~/server/services/groups'
import * as importantDatesService from '~/server/services/important-dates'
import * as nextBidsService from '~/server/services/next-bids'
import * as peopleService from '~/server/services/people'

const idInput = z.object({ id: z.string() })
const personIdInput = z.object({ personId: z.string() })

export const peopleRouter = createTRPCRouter({
  people: createTRPCRouter({
    getAll: protectedProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(({ ctx, input }) => peopleService.list(ctx.user.userId, input)),

    getById: protectedProcedure
      .input(idInput)
      .query(({ ctx, input }) => peopleService.getById(ctx.user.userId, input.id)),

    create: protectedProcedure
      .input(createPersonSchema)
      .mutation(({ input, ctx }) => peopleService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updatePersonSchema)
      .mutation(({ input, ctx }) => peopleService.update(ctx.user.userId, input)),

    archive: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => peopleService.archive(ctx.user.userId, input.id)),

    unarchive: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => peopleService.unarchive(ctx.user.userId, input.id)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => peopleService.remove(ctx.user.userId, input.id)),

    setCategory: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          category: z.enum(personCategoryValues),
          boardOrder: z.number().int().optional(),
        }),
      )
      .mutation(({ input, ctx }) => peopleService.setCategory(ctx.user.userId, input)),

    getTasksAsReferent: protectedProcedure
      .input(personIdInput)
      .query(({ input, ctx }) => peopleService.getTasksAsReferent(ctx.user.userId, input.personId)),

    uploadImage: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(255),
          // base64; data: prefix permitted but not required. Size + magic-byte
          // validated inside the service.
          data: z.string().min(1),
        }),
      )
      .mutation(({ input, ctx }) => peopleService.uploadImage(ctx.user.userId, input)),

    getBucketListItemsAsParticipant: protectedProcedure
      .input(personIdInput)
      .query(({ input, ctx }) => peopleService.getBucketListItemsAsParticipant(ctx.user.userId, input.personId)),
  }),

  groups: createTRPCRouter({
    getAll: protectedProcedure.query(({ ctx }) => groupsService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createPersonGroupSchema)
      .mutation(({ input, ctx }) => groupsService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updatePersonGroupSchema)
      .mutation(({ input, ctx }) => groupsService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => groupsService.remove(ctx.user.userId, input.id)),

    getTasks: protectedProcedure
      .input(z.object({ groupId: z.string() }))
      .query(({ input, ctx }) => groupsService.getTasks(ctx.user.userId, input.groupId)),
  }),

  nextBids: createTRPCRouter({
    list: protectedProcedure
      .input(personIdInput)
      .query(({ input, ctx }) => nextBidsService.list(ctx.user.userId, input.personId)),

    create: protectedProcedure
      .input(createNextBidSchema)
      .mutation(({ input, ctx }) => nextBidsService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateNextBidSchema)
      .mutation(({ input, ctx }) => nextBidsService.update(ctx.user.userId, input)),

    setCompleted: protectedProcedure
      .input(setNextBidCompletedSchema)
      .mutation(({ input, ctx }) => nextBidsService.setCompleted(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => nextBidsService.remove(ctx.user.userId, input.id)),

    listUpcoming: protectedProcedure
      .input(z.object({ withinDays: z.number().int().min(1).max(365).default(60) }).optional())
      .query(({ input, ctx }) => nextBidsService.listUpcoming(ctx.user.userId, input)),
  }),

  importantDates: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ personId: z.string() }).optional())
      .query(({ input, ctx }) => importantDatesService.list(ctx.user.userId, input)),

    create: protectedProcedure
      .input(createImportantDateSchema)
      .mutation(({ input, ctx }) => importantDatesService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateImportantDateSchema)
      .mutation(({ input, ctx }) => importantDatesService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => importantDatesService.remove(ctx.user.userId, input.id)),
  }),

  bucketList: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => bucketListService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createBucketListItemSchema)
      .mutation(({ input, ctx }) => bucketListService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateBucketListItemSchema)
      .mutation(({ input, ctx }) => bucketListService.update(ctx.user.userId, input)),

    toggleCompleted: protectedProcedure
      .input(z.object({ id: z.string(), completed: z.boolean() }))
      .mutation(({ input, ctx }) => bucketListService.toggleCompleted(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => bucketListService.remove(ctx.user.userId, input.id)),
  }),
})
