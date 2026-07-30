// Transport only — logic lives in src/server/services/values.ts.
//
// EXPORTS ONLY SERVER FUNCTIONS (the `.fn.ts` rule): a plain runtime value
// exported here makes the Start compiler treat the module as mixed and
// mis-register every function id in it. `vite build` tolerates that; `vite dev`
// throws "Invalid server function ID" the first time someone clicks the button.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createValueSchema, updateValueSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as values from '~/server/services/values'

const idInput = z.object({ id: z.string() })

export const listValues = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => values.list(context.userId))

export const createValue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createValueSchema)
  .handler(({ data, context }) => values.create(context.userId, data))

export const updateValue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateValueSchema)
  .handler(({ data, context }) => values.update(context.userId, data))

export const deleteValue = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => values.remove(context.userId, data.id))
