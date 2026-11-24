// Transport only — logic lives in src/server/services/ticktick.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/server/middleware/auth'
import * as ticktick from '~/server/services/ticktick'

/** Profile → TickTick: connected or not, the list, the last sync. */
export const fetchTickTickStatus = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => ticktick.status(context.userId))

/** The user's TickTick lists, to pick the one the sync uses. */
export const listTickTickLists = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => ticktick.listLists(context.userId))

/** `{ listId }` for an existing list, `{ newListName }` to make one. Runs the first sync. */
export const chooseTickTickList = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(ticktick.chooseListInput)
  .handler(({ data, context }) => ticktick.chooseList(context.userId, data))

export const syncTickTickNow = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(({ context }) => ticktick.syncNow(context.userId))

export const disconnectTickTick = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(({ context }) => ticktick.disconnect(context.userId))

/** Where captures go: `{ inbox: true }`, `{ listId }` or `{ newListName }`. */
export const chooseTickTickCaptureList = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(ticktick.chooseCaptureListInput)
  .handler(({ data, context }) => ticktick.chooseCaptureList(context.userId, data))
