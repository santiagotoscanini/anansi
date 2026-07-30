// Transport only. Logic lives in src/server/services/{self,self-list-items}.ts.
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../../trpc'
import {
  createSelfListItemSchema,
  reorderSelfListItemsSchema,
  updateSelfListItemSchema,
  updateSelfSchema,
} from '../../types'
import * as selfListItemsService from '~/server/services/self-list-items'
import * as selfService from '~/server/services/self'

export const selfRouter = createTRPCRouter({
  self: createTRPCRouter({
    get: protectedProcedure.query(({ ctx }) => selfService.get(ctx.user.userId)),

    update: protectedProcedure
      .input(updateSelfSchema)
      .mutation(({ input, ctx }) => selfService.update(ctx.user.userId, input)),
  }),

  selfListItems: createTRPCRouter({
    list: protectedProcedure.query(({ ctx }) => selfListItemsService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createSelfListItemSchema)
      .mutation(({ input, ctx }) => selfListItemsService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateSelfListItemSchema)
      .mutation(({ input, ctx }) => selfListItemsService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => selfListItemsService.remove(ctx.user.userId, input.id)),

    reorder: protectedProcedure
      .input(reorderSelfListItemsSchema)
      .mutation(({ input, ctx }) => selfListItemsService.reorder(ctx.user.userId, input)),
  }),
})
