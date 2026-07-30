// Transport only — logic lives in src/server/services/self-list-items.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createSelfListItemSchema, reorderSelfListItemsSchema, updateSelfListItemSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as selfListItems from '~/server/services/self-list-items'

/** Every kind in one call, ordered by kind then position; the client groups them. */
export const listSelfListItems = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => selfListItems.list(context.userId))

// The service zeroes `patternCategory` unless `kind === 'pattern'`, so a
// mismatched pair is silently corrected rather than rejected. That rule lives
// there, not here, so MCP gets it too.
export const createSelfListItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createSelfListItemSchema)
  .handler(({ data, context }) => selfListItems.create(context.userId, data))

export const updateSelfListItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateSelfListItemSchema)
  .handler(({ data, context }) => selfListItems.update(context.userId, data))

export const deleteSelfListItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => selfListItems.remove(context.userId, data.id))

/** Gated on userId + kind, so an id borrowed from another kind is a no-op. */
export const reorderSelfListItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(reorderSelfListItemsSchema)
  .handler(({ data, context }) => selfListItems.reorder(context.userId, data))
