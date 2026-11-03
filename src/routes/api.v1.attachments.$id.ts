import { createFileRoute } from '@tanstack/react-router'
import { withApiKey } from '~/server/api/v1'
import * as attachments from '~/server/services/attachments'

// A file on a sync item. GET is the bytes themselves (an attachment never
// changes, so the phone may cache it for good); DELETE removes it.
export const Route = createFileRoute('/api/v1/attachments/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const file = await attachments.read(userId, params.id)
          return new Response(new Uint8Array(file.data), {
            headers: {
              'content-type': file.mimeType,
              'content-length': String(file.sizeBytes),
              'cache-control': 'private, max-age=31536000, immutable',
            },
          })
        }),
      DELETE: ({ request, params }) => withApiKey(request, ({ userId }) => attachments.remove(userId, params.id)),
    },
  },
})
