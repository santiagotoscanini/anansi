import { createFileRoute } from '@tanstack/react-router'
import { ZodError } from 'zod'
import { errorResponse, withMediaUpload } from '~/server/api/v1'
import { isSameOriginRequest } from '~/server/api/same-origin'
import { getServerSession } from '~/server/auth/session'
import { AppError } from '~/server/services/errors'
import * as journal from '~/server/services/journal'

// A video or a voice recording added to a day from the web. Every other upload
// travels as base64 through a server function and stops at 10 MB; a video does
// not fit that, so the browser sends the file itself as the body of this POST
// (`?fileName=&fileType=video|audio`, a matching Content-Type) and it is
// streamed to the bucket, up to 1 GiB. The session cookie says who, and the
// same-origin check says the page asking is ours.
export const Route = createFileRoute('/api/journal/$day/media')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isSameOriginRequest(request)) return errorResponse('UNAUTHORIZED', 'Not from this site', 403)
        const session = await getServerSession()
        const userId = session?.user?.id
        if (!userId) return errorResponse('UNAUTHORIZED', 'Sign in first', 401)
        try {
          const saved = await withMediaUpload(request, (upload) =>
            journal.uploadMedia(userId, { ...upload, day: params.day }),
          )
          return Response.json(saved, { headers: { 'cache-control': 'no-store' } })
        } catch (err) {
          if (err instanceof AppError) return errorResponse(err.code, err.message, err.status)
          if (err instanceof ZodError)
            return errorResponse('BAD_REQUEST', err.issues[0]?.message ?? 'Invalid input', 400)
          console.error('[journal media]', err)
          return errorResponse('INTERNAL_SERVER_ERROR', 'Something went wrong on the Anansi side', 500)
        }
      },
    },
  },
})
