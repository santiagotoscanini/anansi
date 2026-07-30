// Transport only — logic lives in src/server/services/sync-templates.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createSyncTemplateSchema, setSyncTemplateItemsSchema, updateSyncTemplateSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as syncTemplates from '~/server/services/sync-templates'

export const listSyncTemplates = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => syncTemplates.list(context.userId))

/** Setting `isDefault` clears the previous default in the same transaction. */
export const createSyncTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createSyncTemplateSchema)
  .handler(({ data, context }) => syncTemplates.create(context.userId, data))

export const updateSyncTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateSyncTemplateSchema)
  .handler(({ data, context }) => syncTemplates.update(context.userId, data))

export const deleteSyncTemplate = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => syncTemplates.remove(context.userId, data.id))

/** Replace-set with ordering — not a merge. */
export const setSyncTemplateItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(setSyncTemplateItemsSchema)
  .handler(({ data, context }) => syncTemplates.setItems(context.userId, data))
