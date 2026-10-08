import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { env, oidcEnabled } from '~/lib/env'
import { checkRateLimit, clientIpFromHeaders, limitFailures } from '~/lib/rate-limit'
import { safeNext } from '~/lib/safe-next'
import { authMiddleware } from '~/server/middleware/auth'
import { signInWithCredentials, signOutSession, startOidcSignIn as startOidcSignInAction } from '~/server/auth/actions'
import { getServerSession } from '~/server/auth/session'
import * as authService from '~/server/services/auth'
import { AppError } from '~/server/services/errors'

// EXPORTS ONLY SERVER FUNCTIONS — see the `.fn.ts` convention note in
// AGENTS.md. Anything else exported from here makes the Start compiler treat
// the module as mixed and mis-register the function ids, which surfaces only as
// "Invalid server function ID" the moment someone clicks the button.

// The browser-facing auth surface: what doors exist, which door an address
// goes through, and the flows that change who is signed in. None of the
// pre-sign-in functions can sit behind `authMiddleware` for the obvious
// reason, so each one carries its own IP rate limit instead — this module is
// the unauthenticated attack surface of the app.
//
// Why a result object instead of throwing: every one of these is driven by a
// form, and "email already taken" or "current password is wrong" is ordinary
// user input, not an exception. Throwing would route them through the error
// boundary and lose the field-level message. Genuine faults still throw.
type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

/** Narrow an AppError to its message; anything else stays opaque to the user. */
function toResult(err: unknown): { ok: false; error: string } {
  if (err instanceof AppError) return { ok: false, error: err.message }
  throw err
}

/**
 * The rate-limit gate, applied at the FUNCTION layer rather than in the
 * services, because the key is the client IP and the request is only in scope
 * here. Returns the failure result to hand straight back to the form, or null
 * when the call may proceed.
 */
function limit(endpoint: string, cfg: { limit: number; windowMs: number }): { ok: false; error: string } | null {
  const rl = checkRateLimit(endpoint, ipKey(), cfg)
  return rl.allowed ? null : tooMany(rl.retryAfterSec)
}

function ipKey(): string {
  return `ip:${clientIpFromHeaders(getRequest().headers)}`
}

function tooMany(retryAfterSec: number): { ok: false; error: string } {
  const minutes = Math.ceil(retryAfterSec / 60)
  const wait = retryAfterSec < 90 ? `${retryAfterSec} seconds` : `${minutes} minutes`
  return { ok: false, error: `Too many attempts. Try again in ${wait}.` }
}

/**
 * What doors this deployment has.
 *
 * The client cannot answer this for itself. `oidcEnabled` lives in `~/lib/env`,
 * which is server-only — importing it from a route file would pull dotenv into
 * the browser bundle and throw on first access — so the answer has to cross the
 * wire, and this is the crossing. `/login` and `/register` both read it in
 * `beforeLoad`.
 *
 * Constant for the lifetime of the process, which is why the query that wraps
 * it is `staleTime: Infinity`: one fetch per browser session, and every
 * subsequent client-side navigation to /login answers from cache.
 */
export const fetchAuthMode = createServerFn({ method: 'GET' }).handler(() => ({
  oidcEnabled,
  // Named on the login page's IdP button and the sign-in error screen. Null
  // rather than a default when SSO is off, so a caller cannot render a
  // provider name for a provider that does not exist.
  providerName: oidcEnabled ? (env.OIDC_PROVIDER_NAME ?? 'Pocket ID') : null,
  // Whether /register asks for an invite code. The code itself never crosses
  // the wire — only whether one is needed, so the form can say so up front
  // instead of failing on submit.
  inviteRequired: Boolean(env.INVITE_CODE),
}))

/**
 * Step 1 of the email-first login: which door does this address go through?
 *
 * ⚠ THE ENUMERATION RULE. The service distinguishes three cases; this function
 * answers with TWO. An address that does not exist is reported as `password`,
 * identical to one that does, and the credential check then fails the same way
 * for both. Do not "improve" this by forwarding `unknown` — the moment the
 * browser can tell the difference, /login is an account-existence oracle for
 * every address on the internet.
 *
 * POST rather than GET: it is rate-limited state and must never be cached or
 * prefetched.
 */
export const probeEmail = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().trim().email() }))
  .handler(async ({ data }): Promise<Result<{ method: 'oidc' | 'password' }>> => {
    const limited = limit('auth.probe', { limit: 30, windowMs: 60_000 })
    if (limited) return limited

    const method = await authService.resolveLoginMethod(data.email)
    return { ok: true, method: method === 'oidc' ? 'oidc' : 'password' }
  })

/**
 * Mint the IdP authorize URL for the browser to navigate to.
 *
 * POST, not GET, because it is a write: the underlying action sets the `state`
 * and PKCE cookies that the callback is validated against, and those must land
 * on a response no cache will ever replay.
 *
 * The caller does a FULL-PAGE navigation to the returned URL
 * (`window.location.href`) — a router push cannot work, it is a different
 * origin.
 */
export const startOidcSignIn = createServerFn({ method: 'POST' })
  .validator(z.object({ next: z.string().optional() }))
  .handler(async ({ data }): Promise<Result<{ url: string }>> => {
    const limited = limit('auth.oidcStart', { limit: 30, windowMs: 60_000 })
    if (limited) return limited

    if (!oidcEnabled) return { ok: false, error: 'Single sign-on is not configured on this deployment.' }

    try {
      // safeNext again here even though /login's validator already ran it: this
      // value ends up in a cookie that Auth.js redirects to after the callback,
      // and a server fn is callable directly, not only through that route.
      return { ok: true, url: await startOidcSignInAction(safeNext(data.next)) }
    } catch {
      // Discovery failed or the IdP is unreachable. A message, not a thrown
      // error: this is one of the auth surfaces an unauthenticated visitor sees.
      return { ok: false, error: `Could not reach ${env.OIDC_PROVIDER_NAME ?? 'the identity provider'}. Try again.` }
    }
  })

/**
 * Step 2 of the email-first login.
 *
 * 5 FAILED attempts / 15 minutes / IP; a successful sign-in is not counted
 * (`limitFailures` says how, and why a success does not wipe the failures).
 * The window is per-IP rather than per-account on purpose: a per-account limit
 * lets an attacker lock a known user out of their own account by burning the
 * budget.
 */
export const signIn = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string(), password: z.string() }))
  .handler(async ({ data }): Promise<Result> => {
    try {
      const rl = await limitFailures('auth.signIn', ipKey(), { limit: 5, windowMs: 15 * 60_000 }, () =>
        signInWithCredentials(data.email, data.password),
      )
      return rl.allowed ? { ok: true } : tooMany(rl.retryAfterSec)
    } catch {
      // @auth/core throws on a failed authorize(). Do not report which of the
      // two fields was wrong — that turns the login form into an account
      // enumeration oracle.
      return { ok: false, error: 'Email or password is incorrect' }
    }
  })

/**
 * Register, then sign in.
 *
 * 3 / hour / IP. Registration is the only unauthenticated write in the app and
 * the invite code is checked inside `registerUser`, so this limit is what
 * stands between a scripted attacker and unlimited guesses at it.
 */
export const signUp = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string(), email: z.string(), password: z.string(), inviteCode: z.string().optional() }))
  .handler(async ({ data }): Promise<Result> => {
    const limited = limit('auth.register', { limit: 3, windowMs: 60 * 60_000 })
    if (limited) return limited

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
