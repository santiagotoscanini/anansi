// The phone app's REST API: /api/v1/*, authenticated by an API key the user
// creates on the web (Profile → Devices) and sends as `Authorization: Bearer ank_…`.
//
// Every route file under src/routes/api.v1.* wraps its handler in `withApiKey`,
// which is what the surface test (src/server/surface.test.ts) checks for. Like
// the MCP tools, routes call the service layer directly, in-process: there is
// no second copy of any business rule here, only HTTP in and JSON out.
//
// Errors are `{ "error": { "code": "NOT_FOUND", "message": "…" } }` with the
// matching status. Codes are the service layer's AppErrorCode set.
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { z, ZodError } from 'zod'
import { MAX_MEDIA_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from '~/lib/image-upload'
import { checkRateLimit, clientIpFromHeaders } from '~/lib/rate-limit'
import * as apiKeys from '~/server/services/api-keys'
import { AppError, type AppErrorCode } from '~/server/services/errors'

export interface ApiContext {
  userId: string
  request: Request
}

/** The user's calendar day, `YYYY-MM-DD`: weeks are named by it (see `weekOfDay`). */
export const dayParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'a calendar day, YYYY-MM-DD')

export function errorResponse(code: AppErrorCode, message: string, status: number, headers?: Record<string, string>) {
  return Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store', ...headers } })
}

/**
 * Authenticates the request by its API key, then runs `handler` as that user.
 * A plain value comes back as JSON; a Response is passed through untouched.
 */
export async function withApiKey(request: Request, handler: (ctx: ApiContext) => Promise<unknown>): Promise<Response> {
  // Per IP, before the key check, so guessing keys is throttled too. Generous:
  // a phone refreshing Pulse and uploading a week of pictures stays far below.
  const ip = clientIpFromHeaders(request.headers)
  const rl = checkRateLimit('api_v1', `ip:${ip}`, { limit: 600, windowMs: 60_000 })
  if (!rl.allowed) {
    return errorResponse('TOO_MANY_REQUESTS', 'Slow down', 429, { 'retry-after': String(rl.retryAfterSec) })
  }

  const header = request.headers.get('authorization')
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  const auth = bearer ? await apiKeys.authenticate(bearer) : null
  if (!auth) {
    return errorResponse('UNAUTHORIZED', 'Missing, unknown or revoked API key', 401, {
      'www-authenticate': 'Bearer realm="anansi-api"',
    })
  }

  try {
    const result = await handler({ userId: auth.userId, request })
    if (result instanceof Response) return result
    return Response.json(result ?? null, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    if (err instanceof AppError) return errorResponse(err.code, err.message, err.status)
    if (err instanceof ZodError) {
      const issue = err.issues[0]
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
      return errorResponse('BAD_REQUEST', `${where}${issue?.message ?? 'Invalid input'}`, 400)
    }
    console.error('[api/v1]', request.method, new URL(request.url).pathname, err)
    return errorResponse('INTERNAL_SERVER_ERROR', 'Something went wrong on the Anansi side', 500)
  }
}

/**
 * The JSON body, validated. A body that isn't JSON is a 400 like any other bad
 * input. An empty body reaches the schema as `undefined`, so a schema with a
 * `.default()` makes the body optional (`POST /weeks/{day}` with no options).
 */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const text = await request.text()
  let body: unknown
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      throw new AppError('BAD_REQUEST', 'The body must be JSON')
    }
  }
  return schema.parse(body)
}

const fileTypeParam = z.enum(['image', 'document', 'video', 'audio', 'other'])

/**
 * An upload whose body is the file itself (not JSON, not base64), so the phone
 * can send it from disk with a background upload. `?fileName=` names it and
 * `?fileType=` classifies it (default: image for an image/* Content-Type,
 * other otherwise). The size is checked here; what the bytes are is checked by
 * the service, like every upload.
 */
export async function readUpload(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_UPLOAD_BYTES) throw new AppError('BAD_REQUEST', `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
  const url = new URL(request.url)
  const contentType = request.headers.get('content-type') ?? ''
  const fileType = fileTypeParam.parse(
    url.searchParams.get('fileType') ?? (contentType.startsWith('image/') ? 'image' : 'other'),
  )
  const fileName = z
    .string()
    .min(1)
    .max(500)
    .parse(url.searchParams.get('fileName') ?? 'upload')
  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length === 0) throw new AppError('BAD_REQUEST', 'Empty upload')
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('BAD_REQUEST', `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
  return { fileName, fileType, data: bytes.toString('base64') }
}

/** Whether this upload names itself a video or a voice recording (`?fileType=`), which takes the streamed path. */
export function isMediaUpload(request: Request): boolean {
  const type = new URL(request.url).searchParams.get('fileType')
  return type === 'video' || type === 'audio'
}

/**
 * A video or a voice recording: the body is streamed to a temporary file, never
 * held in memory, and `run` gets its path. The file is removed when `run`
 * settles, whatever happened. Past `MAX_MEDIA_UPLOAD_BYTES` the stream is cut.
 */
export async function withMediaUpload<T>(
  request: Request,
  run: (upload: {
    fileName: string
    fileType: 'video' | 'audio'
    mimeType: string
    path: string
    sizeBytes: number
  }) => Promise<T>,
): Promise<T> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_MEDIA_UPLOAD_BYTES)
    throw new AppError('BAD_REQUEST', `Upload exceeds ${MAX_MEDIA_UPLOAD_BYTES} bytes`)
  const url = new URL(request.url)
  const fileType = z.enum(['video', 'audio']).parse(url.searchParams.get('fileType'))
  const fileName = z
    .string()
    .min(1)
    .max(500)
    .parse(url.searchParams.get('fileName') ?? 'upload')
  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
  if (!request.body) throw new AppError('BAD_REQUEST', 'Empty upload')

  const dir = await mkdtemp(join(tmpdir(), 'anansi-upload-'))
  const path = join(dir, 'body')
  try {
    let sizeBytes = 0
    const counted = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        sizeBytes += chunk.length
        if (sizeBytes > MAX_MEDIA_UPLOAD_BYTES)
          done(new AppError('BAD_REQUEST', `Upload exceeds ${MAX_MEDIA_UPLOAD_BYTES} bytes`))
        else done(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(request.body as WebReadableStream<Uint8Array>), counted, createWriteStream(path))
    if (sizeBytes === 0) throw new AppError('BAD_REQUEST', 'Empty upload')
    return await run({ fileName, fileType, mimeType, path, sizeBytes })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
