// Transport only — logic lives in src/server/services/next-bids.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createNextBidSchema, setNextBidCompletedSchema, updateNextBidSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as nextBids from '~/server/services/next-bids'

export const listNextBids = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ personId: z.string() }))
  .handler(({ data, context }) => nextBids.list(context.userId, data.personId))

export const createNextBid = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createNextBidSchema)
  .handler(({ data, context }) => nextBids.create(context.userId, data))

/** `dueAt: null` clears the deadline; omitting it leaves it alone. */
export const updateNextBid = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateNextBidSchema)
  .handler(({ data, context }) => nextBids.update(context.userId, data))

/** Completed bids stay visible, struck through — the trail is the point. */
export const setNextBidCompleted = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(setNextBidCompletedSchema)
  .handler(({ data, context }) => nextBids.setCompleted(context.userId, data))

export const deleteNextBid = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => nextBids.remove(context.userId, data.id))

/** Open bids across every person, due inside the window. Drives Pulse. */
export const listUpcomingNextBids = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  // `.prefault({})`, not `.default({})`. In zod 4 the two diverged: `.default()`
  // now short-circuits and returns its argument as the parsed OUTPUT, so `{}`
  // would be handed straight to the handler with no `withinDays` at all.
  // `.prefault()` is the zod 3 behaviour — feed the value through the schema —
  // which is what makes the inner `.default(60)` apply.
  .validator(z.object({ withinDays: z.number().int().min(1).max(365).default(60) }).prefault({}))
  .handler(({ data, context }) => nextBids.listUpcoming(context.userId, data))
