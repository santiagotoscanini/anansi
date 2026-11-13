// Transport only — logic lives in src/server/services/mentions.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/server/middleware/auth'
import * as mentions from '~/server/services/mentions'

/** Everywhere the user's text names one person: journal days, sync notes, tasks. */
export const getPersonMentions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ personId: z.string() }))
  .handler(({ data, context }) => mentions.forPerson(context.userId, data.personId))
