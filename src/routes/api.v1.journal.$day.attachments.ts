import { createFileRoute } from '@tanstack/react-router'
import { readUpload, withApiKey } from '~/server/api/v1'
import * as journal from '~/server/services/journal'

// Attaches a picture or a file to one day of the journal, starting the day's
// entry when there is none. The body is the file itself; see `readUpload`.
// It is read and deleted like any attachment, at /api/v1/attachments/{id}.
export const Route = createFileRoute('/api/v1/journal/$day/attachments')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApiKey(request, async ({ userId }) =>
          journal.uploadAttachment(userId, { ...(await readUpload(request)), day: params.day }),
        ),
    },
  },
})
