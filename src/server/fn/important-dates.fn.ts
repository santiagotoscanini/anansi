// Transport only — logic lives in src/server/services/important-dates.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createImportantDateSchema, updateImportantDateSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as importantDates from '~/server/services/important-dates'

/**
 * One person's dates, or — with no `personId` — every date the user has,
 * sorted by month/day. Pulse calls the second form.
 */
export const listImportantDates = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ personId: z.string().optional() }).default({}))
  .handler(({ data, context }) => importantDates.list(context.userId, data))

export const createImportantDate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createImportantDateSchema)
  .handler(({ data, context }) => importantDates.create(context.userId, data))

export const updateImportantDate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateImportantDateSchema)
  .handler(({ data, context }) => importantDates.update(context.userId, data))

export const deleteImportantDate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => importantDates.remove(context.userId, data.id))
