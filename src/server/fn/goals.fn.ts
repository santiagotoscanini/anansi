// Transport only — logic lives in src/server/services/goals.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createGoalSchema, updateGoalSchema, type Goal } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as goals from '~/server/services/goals'

const positionsInput = z.object({
  positions: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })).max(2000),
})

export const listGoals = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  // The explicit return type is load-bearing: `Goal` is the zod-derived shape
  // the whole UI is typed against, and the query builder's inferred row type
  // is structurally close enough to hide a drift without it.
  .handler(({ context }): Promise<Goal[]> => goals.list(context.userId))

export const createGoal = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createGoalSchema)
  .handler(({ data, context }) => goals.create(context.userId, data))

export const updateGoal = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateGoalSchema)
  .handler(({ data, context }) => goals.update(context.userId, data))

export const deleteGoal = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => goals.remove(context.userId, data.id))

/** Lays the whole graph out from its connections; answers what moved and from where. */
export const arrangeGoals = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(({ context }) => goals.arrange(context.userId))

/** Several goals moved in one write: what undoing an arrange sends. */
export const setGoalPositions = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(positionsInput)
  .handler(({ data, context }) => goals.setPositions(context.userId, data.positions))
