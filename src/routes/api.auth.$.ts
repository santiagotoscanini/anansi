import { createFileRoute } from '@tanstack/react-router'
import { Auth } from '@auth/core'
import { authConfig } from '~/server/auth/config'

// Auth.js's own HTTP endpoints, the direct replacement for
// src/app/api/auth/[...nextauth]/route.ts.
//
// Nothing in the UI calls this: sign-in, sign-up and sign-out all run
// in-process through server functions, which is one fewer round trip and keeps
// the Set-Cookie on the response the browser is already waiting for. It exists
// anyway for three reasons, all of which cost one file to keep and a debugging
// session to rediscover:
//
//   1. `/api/auth/*` is a public contract. It is also what `basePath` in
//      config.ts declares, and basePath feeds the cookie name — so the mount
//      point is not free to drift even if nothing called it.
//   2. `pages.signIn: '/login'` means @auth/core redirects error cases here.
//   3. It is the landing pad for the commented-out Google provider: an OAuth
//      callback has to be a real URL the provider can redirect a browser to,
//      and no server function can be that.

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

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => Auth(withForwardedOrigin(request), authConfig),
      POST: ({ request }) => Auth(withForwardedOrigin(request), authConfig),
    },
  },
})
