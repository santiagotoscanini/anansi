// Transport only — logic lives in src/server/services/api-keys.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/server/middleware/auth'
import * as apiKeys from '~/server/services/api-keys'

/** The signed-in user's live API keys (Profile → Devices). */
export const listApiKeys = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => apiKeys.list(context.userId))

/** Creates a key; the raw `key` in the answer is shown once and never again. */
export const createApiKey = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string().trim().min(1).max(100) }))
  .handler(({ data, context }) => apiKeys.create(context.userId, data))

export const revokeApiKey = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => apiKeys.revoke(context.userId, data.id))
