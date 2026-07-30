// Transport only. Logic lives in src/server/services/backup.ts.
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../../trpc'
import { backupSchema } from '../../types'
import * as backupService from '~/server/services/backup'

export const backupRouter = createTRPCRouter({
  backup: createTRPCRouter({
    export: protectedProcedure.query(({ ctx }) => backupService.exportAll(ctx.user.userId)),

    import: protectedProcedure
      .input(
        z.object({
          backup: backupSchema,
          // `z.literal(true)` keeps the confirmation explicit on the wire; the
          // service re-checks it, so the guard survives any future transport.
          confirmReplace: z.literal(true),
        }),
      )
      .mutation(({ input, ctx }) => backupService.importAll(ctx.user.userId, input)),
  }),
})
