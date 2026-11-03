import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { MAX_UPLOAD_BYTES } from '~/lib/image-upload'
import { withApiKey } from '~/server/api/v1'
import * as attachments from '~/server/services/attachments'
import { AppError } from '~/server/services/errors'

const fileTypeParam = z.enum(['image', 'document', 'video', 'audio', 'other'])

// Attaches a file to one item of one week. The body is the file itself (not
// JSON, not base64), so the phone can send it from disk with a background
// upload. `?fileName=` names it and `?fileType=` classifies it (default: image
// for an image/* Content-Type, other otherwise). Same checks as every upload:
// 10 MB, and an image must really be one.
export const Route = createFileRoute('/api/v1/sync-items/$id/attachments')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        withApiKey(request, async ({ userId }) => {
          const declared = Number(request.headers.get('content-length') ?? '0')
          if (declared > MAX_UPLOAD_BYTES) throw new AppError('BAD_REQUEST', `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
          const url = new URL(request.url)
          const contentType = request.headers.get('content-type') ?? ''
          const fileType = fileTypeParam.parse(
            url.searchParams.get('fileType') ?? (contentType.startsWith('image/') ? 'image' : 'other'),
          )
          const fileName = z.string().min(1).max(500).parse(url.searchParams.get('fileName') ?? 'upload')
          const bytes = Buffer.from(await request.arrayBuffer())
          if (bytes.length === 0) throw new AppError('BAD_REQUEST', 'Empty upload')
          if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('BAD_REQUEST', `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
          return attachments.upload(userId, {
            parentType: 'weekly_sync_item',
            parentId: params.id,
            fileName,
            fileType,
            data: bytes.toString('base64'),
          })
        }),
    },
  },
})
