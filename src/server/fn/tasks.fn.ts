// Transport only — logic lives in src/server/services/tasks.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createTaskSchema, updateTaskSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as tasks from '~/server/services/tasks'

// Tasks carry `goalId` on every call, including update and delete: it is what
// the ownership check runs against, so it is not redundant with `id`.
export const createTask = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createTaskSchema.extend({ goalId: z.string() }))
  .handler(({ data, context }) => tasks.create(context.userId, data))

export const updateTask = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateTaskSchema.extend({ goalId: z.string() }))
  .handler(({ data, context }) => tasks.update(context.userId, data))

export const deleteTask = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), goalId: z.string() }))
  .handler(({ data, context }) => tasks.remove(context.userId, data))

/**
 * The Horizons drag-drop endpoint: persist a deadline, nothing else.
 *
 * `z.coerce.date()` rather than `z.date()` because this is the one input that
 * also arrives from a place that has only a string — the bucket a task is
 * dropped into is turned into a date by the client, and a future deep link
 * (plan 4e) would put it in the URL.
 */
export const setTaskScheduled = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), scheduledAt: z.coerce.date().nullable() }))
  .handler(({ data, context }) => tasks.setScheduled(context.userId, data))
