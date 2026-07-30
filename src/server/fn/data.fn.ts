// Transport only — logic lives in src/server/services/data.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/server/middleware/auth'
import * as data from '~/server/services/data'

/**
 * Values + goals + connections in one call — the payload the graph boots from.
 *
 * Kept as a single fn rather than split into three because it is one round
 * trip today (GoalsContext's `data.getAll`) and server functions do not batch
 * the way tRPC's httpBatchLink did. Splitting it would turn one request into
 * three on every client-side navigation.
 */
export const fetchGoalsData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => data.getAll(context.userId))
