// Transport only — logic lives in src/server/services/personality.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { personalityResultInputSchema, updatePersonalityResultSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as personality from '~/server/services/personality'

export const listPersonalityResults = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => personality.list(context.userId))

// The service checks the whole result again (details against its test), so
// the MCP path, which skips this validator, gets the same rule.
export const recordPersonalityResult = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(personalityResultInputSchema)
  .handler(({ data, context }) => personality.record(context.userId, data))

export const updatePersonalityResult = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updatePersonalityResultSchema)
  .handler(({ data, context }) => personality.update(context.userId, data))

export const deletePersonalityResult = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => personality.remove(context.userId, data.id))
