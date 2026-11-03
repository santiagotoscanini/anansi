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
import { z, ZodError } from 'zod'
import { checkRateLimit, clientIpFromHeaders } from '~/lib/rate-limit'
import * as apiKeys from '~/server/services/api-keys'
import { AppError, type AppErrorCode } from '~/server/services/errors'

export interface ApiContext {
  userId: string
  request: Request
}

/** The user's calendar day, `YYYY-MM-DD`: weeks are named by it (see `weekOfDay`). */
export const dayParam = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'a calendar day, YYYY-MM-DD')

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

/** The JSON body, validated. A body that isn't JSON is a 400 like any other bad input. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new AppError('BAD_REQUEST', 'The body must be JSON')
  }
  return schema.parse(body)
}
