import { createFileRoute } from '@tanstack/react-router'
import { readUpload, withApiKey } from '~/server/api/v1'
import * as attachments from '~/server/services/attachments'

// Attaches a file to one item of one week. The body is the file itself; see
// `readUpload`. Same checks as every upload: 10 MB, and an image must really
// be one.
export const Route = createFileRoute('/api/v1/sync-items/$id/attachments')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApiKey(request, async ({ userId }) =>
          attachments.upload(userId, {
            ...(await readUpload(request)),
            parentType: 'weekly_sync_item',
            parentId: params.id,
          }),
        ),
    },
  },
})
