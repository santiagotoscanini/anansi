import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { overlaySchema } from '~/lib/overlay'
import { readJson, withApiKey } from '~/server/api/v1'
import * as trackingItems from '~/server/services/tracking-items'

// The camera overlay drawn for an item (see ~/lib/overlay). PUT sets it, DELETE clears it.
export const Route = createFileRoute('/api/v1/tracking-items/$id/overlay')({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const { overlay } = await readJson(request, z.object({ overlay: overlaySchema }))
          return trackingItems.setOverlay(userId, params.id, overlay)
        }),
      DELETE: ({ request, params }) =>
        withApiKey(request, ({ userId }) => trackingItems.setOverlay(userId, params.id, null)),
    },
  },
})
