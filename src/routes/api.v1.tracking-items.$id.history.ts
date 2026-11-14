import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as trackingItems from '~/server/services/tracking-items'

// One item over time: every week that recorded something for it (notes or
// files), oldest first, each named by its Monday. The pictures themselves are
// read at /api/v1/attachments/{id}.
export const Route = createFileRoute('/api/v1/tracking-items/$id/history')({
  server: {
    handlers: {
      GET: ({ request, params }) => withApiKey(request, ({ userId }) => trackingItems.history(userId, params.id)),
    },
  },
})
