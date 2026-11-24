import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readJson, withApiKey } from '~/server/api/v1'
import * as captures from '~/server/services/captures'

// A voice note's words as the user wrote or corrected them on the phone. They
// are the user's from then on: the server's transcriber never replaces them.
// An empty transcript means no words.
export const Route = createFileRoute('/api/v1/captures/$id')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const body = await readJson(request, z.object({ transcript: z.string().max(20_000) }))
          return captures.setTranscript(userId, { id: params.id, transcript: body.transcript })
        }),
    },
  },
})
