import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/server/middleware/auth'
import { signInWithCredentials, signOutSession } from '~/server/auth/actions'
import { getServerSession } from '~/server/auth/session'
import * as authService from '~/server/services/auth'
import { AppError } from '~/server/services/errors'

// EXPORTS ONLY SERVER FUNCTIONS — see the `.fn.ts` convention note in
// CLAUDE.md. Anything else exported from here makes the Start compiler treat
// the module as mixed and mis-register the function ids, which surfaces only as
// "Invalid server function ID" the moment someone clicks the button.

// The browser-facing auth surface. These replace the four server actions in
// src/app/auth/actions.ts and return the identical
// `{ ok: true } | { ok: false, error }` shape, so each call site changes by one
// import line rather than by a rewrite.
//
// Why a result object instead of throwing: every one of these is driven by a
// form, and "email already taken" or "current password is wrong" is ordinary
// user input, not an exception. Throwing would route them through the error
// boundary and lose the field-level message. Genuine faults still throw.
type Result = { ok: true } | { ok: false; error: string }

/** Narrow an AppError to its message; anything else stays opaque to the user. */
function toResult(err: unknown): Result {
  if (err instanceof AppError) return { ok: false, error: err.message }
  throw err
}

export const signIn = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string(), password: z.string() }))
  .handler(async ({ data }): Promise<Result> => {
    try {
      await signInWithCredentials(data.email, data.password)
      return { ok: true }
    } catch {
      // @auth/core throws on a failed authorize(). Do not report which of the
      // two fields was wrong — that turns the login form into an account
      // enumeration oracle.
      return { ok: false, error: 'Email or password is incorrect' }
    }
  })

export const signUp = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string(), email: z.string(), password: z.string() }))
  .handler(async ({ data }): Promise<Result> => {
    let email: string
    try {
      // registerUser normalises the email; sign in with what it actually
      // stored, not with what the form submitted, or a signup with a
      // capitalised address creates the account and then fails to log into it.
      ;({ email } = await authService.registerUser(data))
    } catch (err) {
      return toResult(err)
    }

    try {
      await signInWithCredentials(email, data.password)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Account created, but sign-in failed. Try logging in.' }
    }
  })

export const signOut = createServerFn({ method: 'POST' }).handler(async (): Promise<Result> => {
  await signOutSession()
  return { ok: true }
})

export const changePassword = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ currentPassword: z.string(), newPassword: z.string() }))
  .handler(async ({ data, context }): Promise<Result> => {
    try {
      await authService.changePassword(context.userId, data)
      return { ok: true }
    } catch (err) {
      return toResult(err)
    }
  })

/**
 * The session as the browser is allowed to see it: signed-in or not, and who.
 *
 * Deliberately not the whole Session object — it is cached client-side and
 * serialised into the SSR payload, so it carries only what the route guard and
 * the shell need. The live profile (avatar, locale) comes from `me`, which
 * reads the users row; the cookie's copy of those goes stale.
 */
export const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getServerSession()
  const userId = session?.user?.id
  if (!userId) return null

  return {
    userId,
    email: session.user?.email ?? null,
    name: session.user?.name ?? null,
  }
})
