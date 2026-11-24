import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { withApiKey, withMediaUpload } from '~/server/api/v1'
import { MAX_VOICE_CAPTURE_BYTES } from '~/lib/captures'
import * as captures from '~/server/services/captures'

// A voice note from the phone. The body is the audio itself (`audio/*`, up to
// 200 MB), streamed to a temporary file and then to the bucket; see
// `withMediaUpload`. The server transcribes it (16 kHz mono WAV, `audio/wav`:
// the transcriber refuses AAC); `?transcript=` is kept for phone builds that
// transcribed on the device. A correction follows with PATCH /captures/{id}.
const query = z.object({
  questionId: z.string().min(1).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  durationMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 3_600_000)
    .optional(),
  transcript: z.string().max(20_000).optional(),
  clientId: z.string().min(1).max(64).optional(),
  clientLog: z.string().max(8000).optional(),
})

export const Route = createFileRoute('/api/v1/captures/voice')({
  server: {
    handlers: {
      POST: ({ request }) =>
        withApiKey(request, async ({ userId }) => {
          const q = query.parse(Object.fromEntries(new URL(request.url).searchParams))
          return withMediaUpload(
            request,
            (upload) =>
              captures.createVoice(userId, {
                questionId: q.questionId ?? null,
                capturedAt: q.capturedAt ? new Date(q.capturedAt) : undefined,
                durationMs: q.durationMs ?? null,
                transcript: q.transcript ?? null,
                clientId: q.clientId ?? null,
                deviceLog: q.clientLog ?? null,
                source: 'phone',
                fileName: upload.fileName,
                mimeType: upload.mimeType,
                path: upload.path,
                sizeBytes: upload.sizeBytes,
              }),
            { fileType: 'audio', maxBytes: MAX_VOICE_CAPTURE_BYTES },
          )
        }),
    },
  },
})
