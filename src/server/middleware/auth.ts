import { createMiddleware } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { getServerSession } from '~/server/auth/session'
import { AppError } from '~/server/services/errors'

// The replacement for tRPC's `protectedProcedure` middleware: resolve the
// session once, hand `userId` to the handler as typed context, and translate
// AppError into an HTTP status the client can act on.
//
// This lives in middleware/ rather than fn/ on purpose. createMiddleware
// returns a plain runtime value, and a `.fn.ts` module that exports one makes
// the Start compiler treat the module as mixed and mis-register its function
// ids — which `vite build` tolerates and `vite dev` only reports as "Invalid
// server function ID" at call time.

export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const userId = (await getServerSession())?.user?.id
  if (!userId) {
    setResponseStatus(401)
    throw new Error('UNAUTHORIZED: Not signed in')
  }

  try {
    return await next({ context: { userId } })
  } catch (err) {
    // Services throw AppError; the wire carries a status and a `CODE: message`
    // string. Seroval will not reconstruct the AppError subclass on the client,
    // so the class itself stops here — `~/lib/queries/errors.ts` parses the
    // message back into a code on the other side. The MCP path is unaffected:
    // it calls services in-process, where `instanceof AppError` still holds and
    // `_meta.trpc_code` stays exact.
    if (err instanceof AppError) {
      setResponseStatus(err.status)
      throw new Error(`${err.code}: ${err.message}`)
    }
    throw err
  }
})
