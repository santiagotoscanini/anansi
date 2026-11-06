// Transport only — logic lives in src/server/services/attachments.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { uploadAttachmentSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as attachments from '~/server/services/attachments'

/**
 * base64 in, `{ url: '/api/files/{id}' }` out.
 *
 * POST for the obvious reason as well as a practical one: a GET server fn
 * carries its payload in the URL, and these payloads are file-sized.
 */
export const uploadAttachment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(uploadAttachmentSchema)
  .handler(({ data, context }) => attachments.upload(context.userId, data))

/** Deletes the file too: its bytes leave the bucket, then its row, and the attachment row with it. */
export const deleteAttachment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => attachments.remove(context.userId, data.id))
