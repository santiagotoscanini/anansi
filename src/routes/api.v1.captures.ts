import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { captureDeviceValues } from '~/lib/api/types'
import { readJson, withApiKey } from '~/server/api/v1'
import * as captures from '~/server/services/captures'

// The phone's captures: GET the latest (for its Inbox list), POST a typed
// thought from the Action Button, Siri or the app. The answer is the capture,
// with where it went when routing finished within a few seconds.
const createBody = z.object({
  text: z.string(),
  questionId: z.string().min(1).nullable().optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  clientId: z.string().min(1).max(64).optional(),
  device: z.enum(captureDeviceValues).optional(),
})

export const Route = createFileRoute('/api/v1/captures')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, async ({ userId }) => {
          const limit = z.coerce
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .parse(new URL(request.url).searchParams.get('limit') ?? undefined)
          return captures.list(userId, { limit: limit ?? 50 })
        }),
      POST: ({ request }) =>
        withApiKey(request, async ({ userId }) => {
          const body = await readJson(request, createBody)
          return captures.create(userId, {
            text: body.text,
            questionId: body.questionId ?? null,
            capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
            clientId: body.clientId,
            source: 'phone',
            device: body.device ?? 'iphone',
          })
        }),
    },
  },
})
