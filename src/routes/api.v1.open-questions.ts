import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import { toPlain } from '~/lib/mentions'
import * as openQuestions from '~/server/services/open-questions'

// The open questions, for the phone's question picker (a capture can be aimed
// at one): id, the question, and the first line of what the user knows so far.
export const Route = createFileRoute('/api/v1/open-questions')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          (await openQuestions.list(userId, { status: 'open' })).map((q) => ({
            id: q.id,
            question: q.question,
            summary:
              toPlain(q.summary ?? '')
                .split('\n')
                .find((l) => l.trim())
                ?.trim() ?? null,
          })),
        ),
    },
  },
})
