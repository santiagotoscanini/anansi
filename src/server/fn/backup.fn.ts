// Transport only — logic lives in src/server/services/backup.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { backupSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as backup from '~/server/services/backup'

/**
 * The whole account as one JSON document, file bytes included.
 *
 * Deliberately has no `queryOptions` factory: ProfileModal calls it once, on a
 * button press, and downloads the result. Caching a full account export would
 * pin every uploaded file in memory for the rest of the session.
 */
export const exportBackup = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => backup.exportAll(context.userId))

/**
 * Destructive: replaces everything the user owns.
 *
 * `z.literal(true)` keeps the confirmation explicit on the wire rather than
 * implied by calling the endpoint. The service re-checks it, so the guard
 * survives a future caller that skips this validator.
 */
export const importBackup = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ backup: backupSchema, confirmReplace: z.literal(true) }))
  .handler(({ data, context }) => backup.importAll(context.userId, data))
