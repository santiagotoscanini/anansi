import { createFileRoute } from '@tanstack/react-router'
import { healthDaysInputSchema } from '~/lib/health'
import { readJson, withApiKey } from '~/server/api/v1'
import * as health from '~/server/services/health'

// Apple Health from the phone: `{ days: [{ day, ...totals }] }`, each day
// replacing what the server had for it. Answers `{ saved }`.
export const Route = createFileRoute('/api/v1/health/days')({
  server: {
    handlers: {
      PUT: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          health.saveDays(userId, await readJson(request, healthDaysInputSchema)),
        ),
    },
  },
})
