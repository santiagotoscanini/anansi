import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readJson, withApiKey } from '~/server/api/v1'
import * as journal from '~/server/services/journal'

// One day of the journal, named by the user's calendar day. GET reads it
// (null when nothing was written). PUT writes it: a field in the body replaces
// what the day holds, a field left out stays, and a day written empty is gone
// (the answer is then null). `@Name` in the text is linked to the person of
// that name. DELETE removes the day with its files.
export const Route = createFileRoute('/api/v1/journal/$day')({
  server: {
    handlers: {
      GET: ({ request, params }) => withApiKey(request, ({ userId }) => journal.get(userId, { day: params.day })),
      PUT: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const body = await readJson(
            request,
            z.object({ content: z.string().optional(), highlights: z.array(z.string()).optional() }),
          )
          return journal.write(userId, { day: params.day, ...body })
        }),
      DELETE: ({ request, params }) => withApiKey(request, ({ userId }) => journal.remove(userId, { day: params.day })),
    },
  },
})
