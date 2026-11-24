// Transport only — logic lives in src/server/services/captures.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { listCapturesSchema, updateCaptureSchema } from '~/lib/api/types'
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
