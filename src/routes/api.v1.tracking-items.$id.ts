import { createFileRoute } from '@tanstack/react-router'
import { updateTrackingItemSchema } from '~/lib/api/types'
import { readJson, withApiKey } from '~/server/api/v1'
import * as trackingItems from '~/server/services/tracking-items'

// One library item. PATCH changes title, description, goal, order or status;
// DELETE archives it when a past week used it, deletes it otherwise.
export const Route = createFileRoute('/api/v1/tracking-items/$id')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        withApiKey(request, async ({ userId }) =>
          trackingItems.update(
            userId,
            await readJson(request, updateTrackingItemSchema.omit({ id: true }).transform((b) => ({ ...b, id: params.id }))),
          ),
        ),
      DELETE: ({ request, params }) => withApiKey(request, ({ userId }) => trackingItems.remove(userId, params.id)),
    },
  },
})
