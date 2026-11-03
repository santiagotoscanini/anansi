import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readJson, withApiKey } from '~/server/api/v1'
import * as weeklySync from '~/server/services/weekly-sync'

// Puts a library item on one week. Adding one that is already there returns it.
export const Route = createFileRoute('/api/v1/syncs/$id/items')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const { trackingItemId } = await readJson(request, z.object({ trackingItemId: z.string() }))
          return weeklySync.addItem(userId, { weeklySyncId: params.id, trackingItemId })
        }),
    },
  },
})
