// Transport only — logic lives in src/server/services/bucket-list.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createBucketListItemSchema, updateBucketListItemSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as bucketList from '~/server/services/bucket-list'

export const listBucketList = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => bucketList.list(context.userId))

export const createBucketListItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createBucketListItemSchema)
  .handler(({ data, context }) => bucketList.create(context.userId, data))

/** Passing `personIds` replaces the whole link set; omitting it leaves it alone. */
export const updateBucketListItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateBucketListItemSchema)
  .handler(({ data, context }) => bucketList.update(context.userId, data))

export const toggleBucketListItemCompleted = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), completed: z.boolean() }))
  .handler(({ data, context }) => bucketList.toggleCompleted(context.userId, data))

export const deleteBucketListItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => bucketList.remove(context.userId, data.id))
