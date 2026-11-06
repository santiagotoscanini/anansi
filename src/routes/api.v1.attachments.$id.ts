import { createFileRoute } from '@tanstack/react-router'
import { fileResponse } from '~/server/api/file-response'
import { withApiKey } from '~/server/api/v1'
import * as attachments from '~/server/services/attachments'
import { AppError } from '~/server/services/errors'

// A file on a sync item. GET is the bytes themselves (an attachment never
// changes, so the phone may cache it for good), streamed from the bucket;
// DELETE removes it, bytes included.
export const Route = createFileRoute('/api/v1/attachments/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const file = await attachments.find(userId, params.id)
          const response = await fileResponse(
            { id: file.fileId, mimeType: file.mimeType, sizeBytes: file.sizeBytes },
            request,
            { 'cache-control': 'private, max-age=31536000, immutable' },
          )
          if (!response) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
          return response
        }),
      DELETE: ({ request, params }) => withApiKey(request, ({ userId }) => attachments.remove(userId, params.id)),
    },
  },
})
