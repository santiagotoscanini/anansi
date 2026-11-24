// Transport only — logic lives in src/server/services/captures.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { captureTermSchema, listCapturesSchema, updateCaptureSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as captures from '~/server/services/captures'

const idInput = z.object({ id: z.string() })

/** The Inbox: captures newest first, with where each went. */
export const listCaptures = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(listCapturesSchema)
  .handler(({ data, context }) => captures.list(context.userId, data))

/** A thought typed into the Inbox's box. */
export const createCapture = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ text: z.string(), questionId: z.string().nullable().optional() }))
  .handler(({ data, context }) =>
    captures.create(context.userId, { text: data.text, questionId: data.questionId ?? null, source: 'web' }),
  )

export const updateCapture = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateCaptureSchema)
  .handler(({ data, context }) => captures.update(context.userId, data))

export const retryCapture = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => captures.retry(context.userId, data.id))

export const deleteCapture = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => captures.remove(context.userId, data.id))

/** A voice note sent to the transcriber again (a failed one's "Try again"). */
export const retranscribeCapture = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => captures.retranscribe(context.userId, data.id))

/** The dictionary for voice notes: what the transcriber hears, and what was meant. */
export const listCaptureTerms = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => captures.listTerms(context.userId))

export const saveCaptureTerm = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(captureTermSchema)
  .handler(({ data, context }) => captures.saveTerm(context.userId, data))

export const deleteCaptureTerm = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => captures.removeTerm(context.userId, data.id))
