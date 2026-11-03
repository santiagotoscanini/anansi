import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as trackingItems from '~/server/services/tracking-items'

// The newest picture any week attached to this item, for the camera's "last
// time" ghost, or null. `?exclude=<sync item id>` leaves out the week being filled.
export const Route = createFileRoute('/api/v1/tracking-items/$id/latest-picture')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApiKey(request, ({ userId }) =>
          trackingItems.latestPicture(userId, params.id, new URL(request.url).searchParams.get('exclude') ?? undefined),
        ),
    },
  },
})
