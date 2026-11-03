import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readJson, withApiKey } from '~/server/api/v1'
import * as weeklySync from '~/server/services/weekly-sync'

// One item of one week. PATCH replaces its notes; DELETE takes it off the week
// with its notes and files (the library entry stays).
export const Route = createFileRoute('/api/v1/sync-items/$id')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const { textContent } = await readJson(request, z.object({ textContent: z.string().max(100_000) }))
          return weeklySync.setItemText(userId, { weeklySyncItemId: params.id, textContent })
        }),
      DELETE: ({ request, params }) =>
        withApiKey(request, ({ userId }) => weeklySync.removeItem(userId, { weeklySyncItemId: params.id })),
    },
  },
})
