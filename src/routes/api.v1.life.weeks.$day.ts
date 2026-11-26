import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as life from '~/server/services/life'

// One week of a life, named by any of its days: its chapters, journal days,
// sync notes and pictures (each picture's bytes at /api/v1/attachments/{id}).
export const Route = createFileRoute('/api/v1/life/weeks/$day')({
  server: {
    handlers: {
      GET: ({ request, params }) => withApiKey(request, ({ userId }) => life.week(userId, { day: params.day })),
    },
  },
})
