import { createFileRoute } from '@tanstack/react-router'
import { createTrackingItemSchema } from '~/lib/api/types'
import { readJson, withApiKey } from '~/server/api/v1'
import * as trackingItems from '~/server/services/tracking-items'

// The library of tracking items (each with its `overlay`, or null).
export const Route = createFileRoute('/api/v1/tracking-items')({
  server: {
    handlers: {
      GET: ({ request }) => withApiKey(request, ({ userId }) => trackingItems.list(userId)),
      POST: ({ request }) =>
        withApiKey(request, async ({ userId }) =>
          trackingItems.create(userId, await readJson(request, createTrackingItemSchema)),
        ),
    },
  },
})
