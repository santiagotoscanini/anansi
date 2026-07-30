// Transport only — logic lives in src/server/services/connections.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createConnectionSchema, updateConnectionSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as connections from '~/server/services/connections'

export const listConnections = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => connections.list(context.userId))

export const createConnection = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createConnectionSchema)
  .handler(({ data, context }) => connections.create(context.userId, data))

export const updateConnection = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateConnectionSchema)
  .handler(({ data, context }) => connections.update(context.userId, data))

export const deleteConnection = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => connections.remove(context.userId, data.id))
