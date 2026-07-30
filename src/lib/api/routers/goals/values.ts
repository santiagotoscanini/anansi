// Transport only. All logic lives in src/server/services/{values,value-behaviors}.ts
// so the MCP tools (and, after the migration, TanStack Start server functions)
// can call it without going through tRPC.
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../../trpc'
import { createValueBehaviorSchema, createValueSchema, updateValueSchema } from '../../types'
import * as valueBehaviorsService from '~/server/services/value-behaviors'
import * as valuesService from '~/server/services/values'

const idInput = z.object({ id: z.string() })

export const valuesRouter = createTRPCRouter({
  values: createTRPCRouter({
    getAll: protectedProcedure.query(({ ctx }) => valuesService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createValueSchema)
      .mutation(({ input, ctx }) => valuesService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateValueSchema)
      .mutation(({ input, ctx }) => valuesService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => valuesService.remove(ctx.user.userId, input.id)),
  }),

  valueBehaviors: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ valueId: z.string() }))
      .query(({ input, ctx }) => valueBehaviorsService.list(ctx.user.userId, input.valueId)),

    listAll: protectedProcedure.query(({ ctx }) => valueBehaviorsService.listAll(ctx.user.userId)),

    create: protectedProcedure
      .input(createValueBehaviorSchema)
      .mutation(({ input, ctx }) => valueBehaviorsService.create(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => valueBehaviorsService.remove(ctx.user.userId, input.id)),
  }),
})
