import { createFileRoute } from '@tanstack/react-router'
import { isMediaUpload, readUpload, withApiKey, withMediaUpload } from '~/server/api/v1'
import * as attachments from '~/server/services/attachments'

// Attaches a file to one item of one week. The body is the file itself; see
// `readUpload`. Same checks as every upload: 10 MB, and an image must really
// be one. A video or a voice recording (`?fileType=video|audio`, up to 1 GiB)
// is streamed instead of held; see `withMediaUpload`.
export const Route = createFileRoute('/api/v1/sync-items/$id/attachments')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApiKey(request, async ({ userId }) =>
          isMediaUpload(request)
            ? withMediaUpload(request, (upload) =>
                attachments.uploadMedia(userId, { ...upload, parentType: 'weekly_sync_item', parentId: params.id }),
              )
            : attachments.upload(userId, {
                ...(await readUpload(request)),
                parentType: 'weekly_sync_item',
                parentId: params.id,
              }),
        ),
    },
  },
})
