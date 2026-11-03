import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readJson, withApiKey } from '~/server/api/v1'
import * as syncTemplates from '~/server/services/sync-templates'

// Replaces a template's items: `trackingItemIds`, first to last.
export const Route = createFileRoute('/api/v1/templates/$id/items')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const { trackingItemIds } = await readJson(
            request,
            z.object({ trackingItemIds: z.array(z.string()).max(500) }),
          )
          return syncTemplates.setItems(userId, {
            templateId: params.id,
            items: trackingItemIds.map((trackingItemId, orderIdx) => ({ trackingItemId, orderIdx })),
          })
        }),
    },
  },
})
