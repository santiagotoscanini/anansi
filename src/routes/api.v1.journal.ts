import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as journal from '~/server/services/journal'

// The journal, newest day first: `?from=&to=` (calendar days), `?personId=`
// (the days that mention that person), `?q=` (words in the text) and
// `?limit=` (default 30, at most 100). Days with nothing written are absent.
export const Route = createFileRoute('/api/v1/journal')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, ({ userId }) => {
          const q = new URL(request.url).searchParams
          const limit = q.get('limit')
          return journal.list(userId, {
            from: q.get('from') ?? undefined,
            to: q.get('to') ?? undefined,
            personId: q.get('personId') ?? undefined,
            query: q.get('q') ?? undefined,
            limit: limit === null ? undefined : Number(limit),
          })
        }),
    },
  },
})
