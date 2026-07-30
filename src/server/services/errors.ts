// Framework-agnostic error type for the service layer.
//
// Services are called from three places with three different error conventions:
// tRPC procedures (today), TanStack Start server functions (after the migration),
// and MCP tools (in-process, both before and after). None of them should dictate
// how a service signals failure, so services throw `AppError` and each caller
// translates:
//
//   - tRPC          → `appErrorToTRPC` in src/lib/api/trpc.ts
//   - MCP tools     → `mcpErrorFromUnknown` in src/lib/mcp/errors.ts
//   - server fns    → HTTP status + a `CODE: message` string (see the migration plan)
//
// The code set is deliberately exactly what the routers already throw — I counted
// them before writing this: NOT_FOUND x40, INTERNAL_SERVER_ERROR x17, BAD_REQUEST x4,
// TOO_MANY_REQUESTS x3, CONFLICT x1, plus UNAUTHORIZED from protectedProcedure.
// Keeping it to that set means the translation to TRPCError is lossless and no
// existing client behaviour changes.
//
// There is deliberately no FORBIDDEN. Ownership checks in this codebase return
// NOT_FOUND ("not found or access denied") so a caller cannot distinguish "exists
// but isn't yours" from "doesn't exist" — that's an intentional
// non-enumeration property, not an oversight. Don't add FORBIDDEN without
// checking you aren't leaking existence.
export type AppErrorCode =
  'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'INTERNAL_SERVER_ERROR'

const HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
}

export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'AppError'
  }

  get status(): number {
    return HTTP_STATUS[this.code]
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
