// Transport only — logic lives in src/server/services/weekly-sync.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  addSyncItemSchema,
  createWeeklySyncSchema,
  removeSyncItemSchema,
  reorderSyncItemsSchema,
  setSyncItemTextSchema,
} from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as weeklySync from '~/server/services/weekly-sync'

// `z.coerce.date()` rather than the routers' `z.date()`. Seroval does carry a
// real Date across the wire, but a GET server fn puts its payload in the URL,
// and the week is exactly the kind of value that ends up hand-written there
// (the `?week=` deep link in plan 4e). Coercing accepts both and the service
// re-parses either way.
const weekStartInput = z.object({ weekStart: z.coerce.date() })

export const getSyncByWeek = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(weekStartInput)
  .handler(({ data, context }) => weeklySync.getByWeek(context.userId, data.weekStart))

/**
 * Everything the retrospective screen needs in one call: the sync row, the full
 * tracking-item library, the goal-grouped items with their attachments, and the
 * unscoped items. Deliberately not decomposed — see the batching note in
 * data.fn.ts.
 */
export const getWeeklyRetrospectiveData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(weekStartInput)
  .handler(({ data, context }) => weeklySync.getWeeklyRetrospectiveData(context.userId, data.weekStart))

/** Snapshots the default template's items, or the one named by `templateId`. */
export const createWeeklySync = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createWeeklySyncSchema)
  .handler(({ data, context }) => weeklySync.create(context.userId, data))

export const addSyncItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(addSyncItemSchema)
  .handler(({ data, context }) => weeklySync.addItem(context.userId, data))

/** Drops the item from this sync only — the library row survives. */
export const removeSyncItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(removeSyncItemSchema)
  .handler(({ data, context }) => weeklySync.removeItem(context.userId, data))

export const setSyncItemText = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(setSyncItemTextSchema)
  .handler(({ data, context }) => weeklySync.setItemText(context.userId, data))

export const reorderSyncItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(reorderSyncItemsSchema)
  .handler(({ data, context }) => weeklySync.reorderItems(context.userId, data))
