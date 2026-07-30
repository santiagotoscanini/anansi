// Reading a service error back on the client.
//
// Services throw `AppError`, and `authMiddleware` turns that into an HTTP
// status plus a message of the form `CODE: text`. The class itself does not
// survive the trip: Seroval reconstructs a plain `Error`, so `instanceof
// AppError` is false in the browser no matter how it was thrown. That is why
// the code travels inside the message rather than as a property — a property on
// an Error subclass is exactly what does not come back.
//
// The MCP path is unaffected. It calls services in-process, where the real
// AppError arrives intact and `_meta.trpc_code` stays exact.
//
// `import type` — erased at build, so this file stays client-safe. If a
// `no-restricted-imports` boundary is added for `~/server/**` (plan 3.5), it
// must set `allowTypeImports: true` or this is a false positive.
import type { AppErrorCode } from '~/server/services/errors'

export type ParsedError = {
  /** 'UNKNOWN' for anything that did not come from the service layer. */
  code: AppErrorCode | 'UNKNOWN'
  /** Safe to show a user: services write these deliberately. */
  message: string
}

// Anchored, and the code must be one of ours. A user-authored string that
// happens to start with "TODO: " does not become a code.
const CODES: readonly AppErrorCode[] = [
  'UNAUTHORIZED',
  'NOT_FOUND',
  'BAD_REQUEST',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'INTERNAL_SERVER_ERROR',
]

/**
 * Split a thrown value into a machine code and a human message.
 *
 * Falls back to `{ code: 'UNKNOWN', message }` rather than throwing, because
 * every caller of this is already on an error path and a parse failure there is
 * the worst possible time to raise a second error.
 */
export function parseAppError(err: unknown): ParsedError {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const separator = message.indexOf(': ')

  if (separator > 0) {
    const candidate = message.slice(0, separator)
    if ((CODES as readonly string[]).includes(candidate)) {
      return { code: candidate as AppErrorCode, message: message.slice(separator + 2) }
    }
  }

  return { code: 'UNKNOWN', message: message || 'Something went wrong' }
}

/**
 * Did this fail because the session is gone?
 *
 * The one code the app acts on programmatically — a global QueryCache handler
 * uses it to send the user to /login. Everything else is toasted as text, which
 * is what all 63 mutation sites did under tRPC too: no component has ever read
 * an error code.
 */
export function isUnauthorized(err: unknown): boolean {
  return parseAppError(err).code === 'UNAUTHORIZED'
}
