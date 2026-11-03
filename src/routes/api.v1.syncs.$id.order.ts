import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readJson, withApiKey } from '~/server/api/v1'
import * as weeklySync from '~/server/services/weekly-sync'

// The week's order: `ids` are sync item ids, first to last.
export const Route = createFileRoute('/api/v1/syncs/$id/order')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const { ids } = await readJson(request, z.object({ ids: z.array(z.string()).max(500) }))
          return weeklySync.reorderItems(userId, {
            weeklySyncId: params.id,
            ordering: ids.map((id, orderIdx) => ({ id, orderIdx })),
          })
        }),
    },
  },
})
