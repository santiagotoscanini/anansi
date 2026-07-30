// Transport only — logic lives in src/server/services/self.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { updateSelfSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as self from '~/server/services/self'

/** Null until the user writes something — an untouched Self page is a clean page. */
export const getSelf = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => self.get(context.userId))

/** Partial upsert: only the fields present in `data` are written. */
export const updateSelf = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateSelfSchema)
  .handler(({ data, context }) => self.update(context.userId, data))
