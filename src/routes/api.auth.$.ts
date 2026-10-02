import { createFileRoute } from '@tanstack/react-router'
import { Auth } from '@auth/core'
import { authConfig, oidcProviderId } from '~/server/auth/config'

// Auth.js's own HTTP endpoints, the direct replacement for
// src/app/api/auth/[...nextauth]/route.ts, cut down to what is safe to serve.
//
// The UI never posts here: sign-in, sign-up, sign-out and the start of the
// OIDC flow all run in-process through server functions
// (src/server/fn/auth.fn.ts → src/server/auth/actions.ts), which is one fewer
// round trip, keeps the Set-Cookie on the response the browser is already
// waiting for, and puts every password check behind the per-IP limit.
//
// That is why the credentials doors are NOT served here. `POST
// /api/auth/callback/credentials` is a second door to the same password check
// that the signIn server fn's `auth.signIn` limit never sees, so leaving
// it open made the rate limit decorative (found 2026-10-02, security review).
// Every action the app does not use answers 404:
//
//   GET  session, csrf, providers   harmless reads (no secret, no write)
//   GET  signin, error              where @auth/core sends a browser on its own
//                                   (`pages.signIn: '/login'` turns both into a
//                                   redirect to the login page)
//   POST signout                    clears the cookie; Auth.js checks its own
//                                   CSRF token on it
//   GET/POST signin/<oidc id>       the Pocket ID door: starting the flow, and
//   GET/POST callback/<oidc id>     the URL the IdP sends the browser back to
//                                   (it has to be a real URL; no server function
//                                   can be one). Registered at the IdP, so the
//                                   id comes from config.ts, never a literal.
//
// `signin/credentials` and `callback/credentials` (the password doors) are not
// on the list. The mount point stays because `/api/auth` is what `basePath` in
// config.ts declares, and basePath feeds the cookie name.

const ALLOWED: Record<string, ReadonlySet<string>> = {
  GET: new Set([
    'session',
    'csrf',
    'providers',
    'signin',
    'error',
    `signin/${oidcProviderId}`,
    `callback/${oidcProviderId}`,
  ]),
  POST: new Set(['signout', `signin/${oidcProviderId}`, `callback/${oidcProviderId}`]),
}

/** Served only for an `/api/auth/<action>[/<oidc id>]` on the list above. */
function allowed(request: Request): boolean {
  const path = new URL(request.url).pathname
  const prefix = `${authConfig.basePath}/`
  if (!path.startsWith(prefix)) return false
  return ALLOWED[request.method]?.has(path.slice(prefix.length)) ?? false
}

/**
 * Rewrite the request URL to the scheme and host the *client* used.
 *
 * @auth/core reads the protocol straight off `request.url`
 * (lib/init.js:69 — `defaultCookies(useSecureCookies ?? url.protocol ===
 * 'https:')`) and that decides whether the session cookie is named
 * `authjs.session-token` or `__Secure-authjs.session-token`. Behind a TLS-
 * terminating proxy the request arrives over plain http, so without this the
 * handler would look for the unprefixed name while the browser is holding the
 * `__Secure-` one — every request through this route reads as signed out, and
 * a Google callback would write a non-secure cookie in production.
 *
 * Next did this for us: it builds `NextRequest.url` from the forwarded headers,
 * so its route handler never had to think about it. Nitro passes the transport
 * URL through untouched, which is more honest and requires this function.
 *
 * A negative control caught this — `x-forwarded-proto: https` plus an
 * unprefixed cookie resolved to a user here while correctly resolving to null
 * on Next. See scripts/check-auth-compat.mjs, which is where it will be caught
 * again if this is ever removed.
 */
function withForwardedOrigin(request: Request): Request {
  const proto = request.headers.get('x-forwarded-proto')
  const host = request.headers.get('x-forwarded-host')
  if (!proto && !host) return request

  const url = new URL(request.url)
  if (proto) url.protocol = `${proto.split(',')[0]!.trim()}:`
  if (host) url.host = host.split(',')[0]!.trim()

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    // Required by undici whenever a stream is the request body. Spread rather
    // than written inline because it is absent from lib.dom's RequestInit, and
    // an inline key would trip excess-property checking.
    ...(hasBody ? { duplex: 'half' } : {}),
  })
}

function handle({ request }: { request: Request }): Response | Promise<Response> {
  if (!allowed(request)) {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
  }
  return Auth(withForwardedOrigin(request), authConfig)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
})
