import { Auth, createActionURL } from '@auth/core'
import type { Session } from '@auth/core/types'
import { getRequest } from '@tanstack/react-start/server'
import { AppError } from '~/server/services/errors'
import { authConfig } from './config'

// Reading the session cookie, ported near-verbatim from next-auth/lib/index.js
// (getSession, lines 7-38) — the exact code path `auth()` runs today.
//
// The obvious alternative, hand-decoding with `@auth/core/jwt`'s getToken(), was
// rejected for two verified reasons:
//
//   1. The JWE key is derived from a salt that DEFAULTS TO THE COOKIE NAME
//      (jwt.js:86 → :122), and the name carries a `__Secure-` prefix over https
//      (init.js:69). Hand-decoding means hand-reproducing that rule; get it
//      wrong and decryption returns null with no error — everyone is silently
//      logged out. Going through the session action derives the name, the
//      prefix and the salt from the same code that WROTE the cookie, which
//      removes the failure class by construction rather than by care.
//   2. getToken() returns the raw JWT payload and never runs the `session`
//      callback — so `session.user.id`, which config.ts's callback produces and
//      every service call depends on, would simply not exist.
//
// It also reassembles chunked >4096-byte cookies for free, and under
// `strategy: 'jwt'` costs exactly the same HKDF + JWE decrypt as getToken with
// no adapter or DB work.

// One decrypt per request, not per caller. An SSR pass runs `beforeLoad` plus
// however many server fns the loaders fire, and each would otherwise redo the
// HKDF + JWE. Keyed on the Request object so entries are collected with it.
const sessionCache = new WeakMap<Request, Promise<Session | null>>()

export function getServerSession(): Promise<Session | null> {
  const request = getRequest()
  const cached = sessionCache.get(request)
  if (cached) return cached

  const pending = readSession(request)
  sessionCache.set(request, pending)
  return pending
}

/** For server routes, which want a 401 rather than a null to branch on. */
export async function requireUserId(): Promise<string> {
  const userId = (await getServerSession())?.user?.id
  if (!userId) throw new AppError('UNAUTHORIZED', 'Not signed in')
  return userId
}

async function readSession(request: Request): Promise<Session | null> {
  const headers = request.headers

  // The protocol argument is load-bearing, and this is where a port most
  // easily goes wrong. createActionURL resolves it as
  //   x-forwarded-proto ?? protocol ?? 'https'
  // and @auth/core turns the resulting URL's protocol into the cookie name.
  // Next always sets x-forwarded-proto, so next-auth can pass it alone and let
  // the fallback be unreachable. Nitro does not, so passing only the header
  // would fall through to 'https' on plain-http localhost, ask for
  // `__Secure-authjs.session-token`, find nothing, and report "logged out" on
  // a perfectly good cookie. Reading it off the request URL reproduces what
  // Next puts in the header; behind the real proxy the header still wins, so
  // production keeps resolving to the `__Secure-` name exactly as today.
  const protocol = new URL(request.url).protocol

  const url = createActionURL('session', protocol, headers, process.env, authConfig)

  // The one part of next-auth's getSession NOT ported: it wraps the session
  // callback in `{ user: token, ...session }` so a server-side caller sees the
  // full token rather than the trimmed client-facing payload. That wrapper only
  // does anything when the app has no session callback of its own — and
  // config.ts has one, which already writes `user.id` onto the session and
  // returns the whole object. The spread would land `user` twice with the
  // second winning, which is how TypeScript found this: it flags the duplicate
  // key. Keeping it would have been dead code pretending to be a safety net.
  //
  // Consequence to know: if config.ts's `session` callback is ever removed,
  // `session.user.id` disappears and every service call loses its userId. The
  // callback is load-bearing, not decorative.
  const response = await Auth(new Request(url, { headers: { cookie: headers.get('cookie') ?? '' } }), authConfig)

  // A non-OK response is @auth/core reporting a problem — a bad provider
  // config, for instance — and its body is an error object like
  // `{ message: "There was a problem..." }`. Returning that as the session
  // would make every `if (session)` check pass for an anonymous visitor, i.e.
  // fail OPEN. Treat anything non-OK as "no session".
  if (!response.ok) return null

  // Deliberately NOT replaying response.headers.getSetCookie(). The session
  // action re-signs the JWT and emits a refreshed cookie, but next-auth's
  // server-component path (the one this app uses via `await auth()`) discards
  // it, so sessions do not slide today. Replaying it here would rewrite the
  // session cookie on every SSR render — a real behaviour change, and not one
  // to make silently in the phase whose entire purpose is cookie compatibility.
  return (await response.json()) as Session | null
}
