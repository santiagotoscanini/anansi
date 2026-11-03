import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as goals from '~/server/services/goals'

// Active goals, just what a picker needs.
export const Route = createFileRoute('/api/v1/goals')({
  server: {
    handlers: {
      GET: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          (await goals.list(userId)).map((g) => ({ id: g.id, title: g.title, emoji: g.emoji ?? null })),
        ),
    },
  },
})
