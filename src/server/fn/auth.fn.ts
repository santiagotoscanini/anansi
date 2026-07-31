import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { env, oidcEnabled } from '~/lib/env'
import { safeNext } from '~/lib/safe-next'
import { authMiddleware } from '~/server/middleware/auth'
import { signInWithCredentials, signOutSession, startOidcSignIn as startOidcSignInAction } from '~/server/auth/actions'
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

/**
 * Which front door this deployment has: single sign-on, or email + password.
 *
 * The client cannot answer this for itself. `oidcEnabled` lives in `~/lib/env`,
 * which is server-only — importing it from a route file would pull dotenv into
 * the browser bundle and throw on first access — so the answer has to cross the
 * wire, and this is the crossing. `/login` and `/register` both read it in
 * `beforeLoad`, where it decides whether a form renders at all.
 *
 * Constant for the lifetime of the process, which is why the query that wraps
 * it is `staleTime: Infinity`: one fetch per browser session, and every
 * subsequent client-side navigation to /login answers from cache.
 */
export const fetchAuthMode = createServerFn({ method: 'GET' }).handler(() => ({
  oidcEnabled,
  // Named on the sign-in error screen ("anansi couldn't finish with Pocket ID").
  // Null rather than a default when SSO is off, so a caller cannot render a
  // provider name for a provider that does not exist.
  providerName: oidcEnabled ? (env.OIDC_PROVIDER_NAME ?? 'Pocket ID') : null,
}))

/**
 * Mint the IdP authorize URL for the browser to navigate to.
 *
 * POST, not GET, because it is a write: the underlying action sets the `state`
 * and PKCE cookies that the callback is validated against, and those must land
 * on a response no cache will ever replay.
 *
 * The caller does a FULL-PAGE navigation to the returned URL
 * (`window.location.href`, or a router redirect with an absolute `href`, which
 * TanStack turns into one). A router push cannot work — it is a different
 * origin.
 */
export const startOidcSignIn = createServerFn({ method: 'POST' })
  .validator(z.object({ next: z.string().optional() }))
  .handler(async ({ data }) => {
    // safeNext again here even though /login's validator already ran it: this
    // value ends up in a cookie that Auth.js redirects to after the callback,
    // and a server fn is callable directly, not only through that route.
    return { url: await startOidcSignInAction(safeNext(data.next)) }
  })

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

// ── The users row ───────────────────────────────────────────────────────────
// Everything below reads or writes `public.users` for the signed-in user, and
// none of it touches the session cookie. That is the reason `me` exists next to
// `fetchSession` rather than being folded into it: the cookie carries a name and
// email frozen at sign-in time, while these are live. Edit your name in
// ProfileModal and the cookie still says the old one until you sign in again.

/** The live profile row: name, email, avatar, locale. */
export const fetchMe = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => authService.me(context.userId))

/** Rejects an email already taken by another account (CONFLICT). */
export const updateProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
    }),
  )
  .handler(({ data, context }) => authService.updateProfile(context.userId, data))

/**
 * base64 in, `users.avatarUrl` pointed at the new `/api/files/{id}`.
 *
 * The previous blob is deleted only after the update lands, so a failure
 * anywhere leaves the old avatar serving rather than a broken image.
 */
export const uploadAvatar = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      fileName: z.string().min(1).max(255),
      // `data:` prefix permitted but not required; size and magic bytes are
      // validated inside the service.
      data: z.string().min(1),
    }),
  )
  .handler(({ data, context }) => authService.uploadAvatar(context.userId, data))

/** Clears `avatarUrl` and deletes the blob — Avatar falls back to initials. */
export const removeAvatar = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(({ context }) => authService.removeAvatar(context.userId))

/**
 * Persist the user's language choice.
 *
 * This is the durable mirror, not the source of truth for the current render —
 * that is the cookie `getShellPrefs` reads in shell.fn.ts. Both exist
 * because the cookie is what SSR can see before any query resolves, and the
 * column is what survives a new browser.
 */
export const setLocale = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ locale: z.enum(['en', 'es']) }))
  .handler(({ data, context }) => authService.setLocale(context.userId, data.locale))
