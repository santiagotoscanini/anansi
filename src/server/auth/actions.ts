import { Auth, createActionURL, raw, skipCSRFCheck } from '@auth/core'
import { getRequest, setCookie } from '@tanstack/react-start/server'
import { authConfig } from './config'

// Sign-in / sign-out, ported from next-auth/lib/actions.js (lines 6-56 and
// 58-71). Same mechanism as the server actions in src/app/auth/actions.ts:
// build a request to Auth.js's own signin/signout endpoint, run it in-process
// with `raw` so we get the Set-Cookie list back instead of a Response, and
// replay those cookies onto the outgoing response.
//
// `skipCSRFCheck` for the same reason next-auth passes it: these never go
// through Auth.js's csrf-token form dance, and TanStack Start server functions
// are already Origin-checked.
//
// In-process rather than a fetch to /api/auth/* — no network hop, and the
// cookies land on the response of whatever server fn the browser actually
// called.

/**
 * Build the header set for the synthetic Auth.js request.
 *
 * Only the headers Auth.js reads: the host/proto pair, which createActionURL
 * turns into the request URL and @auth/core turns into the cookie name, and the
 * existing cookies. next-auth forwards the incoming headers wholesale, which
 * also drags along the caller's `content-length` — harmless for a server action
 * carrying no body, but this request has one, and a stale length would truncate
 * it.
 */
function authRequestHeaders(request: Request): Headers {
  const headers = new Headers()
  for (const name of ['host', 'x-forwarded-host', 'x-forwarded-proto', 'cookie']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('Content-Type', 'application/x-www-form-urlencoded')
  return headers
}

/** Replay Auth.js's cookie mutations onto the response Start is building. */
function applyCookies(response: { cookies?: { name: string; value: string; options: object }[] }) {
  for (const cookie of response.cookies ?? []) {
    setCookie(cookie.name, cookie.value, cookie.options)
  }
}

/**
 * Sign in with the credentials provider.
 *
 * Throws on bad credentials — that is @auth/core's documented behaviour under
 * `raw` (index.js:120 rethrows rather than redirecting to an error page), and
 * it is what the existing `try/catch → "Email or password is incorrect"` at the
 * call sites is written against. Do not "improve" this into inspecting the
 * returned redirect URL for an `error` param; the throw is the contract.
 */
export async function signInWithCredentials(email: string, password: string): Promise<void> {
  const request = getRequest()
  const headers = authRequestHeaders(request)
  const protocol = new URL(request.url).protocol

  // Credentials is the one provider type whose sign-in goes straight to the
  // callback endpoint — there is no external redirect to bounce through.
  // next-auth spells this as a string replace on the signin URL; doing it by
  // action name is the same URL with less rope.
  const url = createActionURL('callback', protocol, headers, process.env, authConfig)
  url.pathname += '/credentials'

  const body = new URLSearchParams({ email, password, callbackUrl: '/' })
  const response = await Auth(new Request(url, { method: 'POST', headers, body }), {
    ...authConfig,
    raw,
    skipCSRFCheck,
  })

  applyCookies(response)
}

export async function signOutSession(): Promise<void> {
  const request = getRequest()
  const headers = authRequestHeaders(request)
  const protocol = new URL(request.url).protocol

  const url = createActionURL('signout', protocol, headers, process.env, authConfig)
  const body = new URLSearchParams({ callbackUrl: '/' })

  const response = await Auth(new Request(url, { method: 'POST', headers, body }), {
    ...authConfig,
    raw,
    skipCSRFCheck,
  })

  applyCookies(response)
}
