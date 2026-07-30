// Transport only — logic lives in src/server/services/value-behaviors.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createValueBehaviorSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as valueBehaviors from '~/server/services/value-behaviors'

export const listValueBehaviors = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ valueId: z.string() }))
  .handler(({ data, context }) => valueBehaviors.list(context.userId, data.valueId))

/** Every behaviour across every value — what ValuesManager renders. */
export const listAllValueBehaviors = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => valueBehaviors.listAll(context.userId))

export const createValueBehavior = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createValueBehaviorSchema)
  .handler(({ data, context }) => valueBehaviors.create(context.userId, data))

export const deleteValueBehavior = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => valueBehaviors.remove(context.userId, data.id))
