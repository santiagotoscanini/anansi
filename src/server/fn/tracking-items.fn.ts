// Transport only — logic lives in src/server/services/tracking-items.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createTrackingItemSchema, updateTrackingItemSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as trackingItems from '~/server/services/tracking-items'

/**
 * The library, optionally narrowed to one goal.
 *
 * `.default({})` rather than `.optional()` so `data` is always an object by the
 * time the service sees it — the service's own parameter is optional, and two
 * layers of optionality is one more place for `{ goalId: undefined }` and
 * `undefined` to produce different query keys.
 */
export const listTrackingItems = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ goalId: z.string().optional() }).default({}))
  .handler(({ data, context }) => trackingItems.list(context.userId, data))

export const createTrackingItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createTrackingItemSchema)
  .handler(({ data, context }) => trackingItems.create(context.userId, data))

export const updateTrackingItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateTrackingItemSchema)
  .handler(({ data, context }) => trackingItems.update(context.userId, data))

/** Soft-deletes when a sync still references the item, hard otherwise. */
export const deleteTrackingItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => trackingItems.remove(context.userId, data.id))

/** One item over time: every week that recorded something for it, oldest first. */
export const getTrackingItemHistory = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => trackingItems.history(context.userId, data.id))
