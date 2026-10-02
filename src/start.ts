import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { applySecurityHeaders } from '~/lib/security-headers'

// The Start instance. TanStack resolves this file by convention (`src/start.ts`)
// — it is not imported by anything, and deleting it silently drops everything
// declared here rather than failing to build.

// Security headers on every response, replacing `next.config.js`'s
// `headers()` block with `source: '/:path*'`.
//
// A REQUEST middleware, not a function middleware: request middleware wraps
// every request Start handles — page renders, server functions, server routes
// (/api/mcp, /api/files/:id, the OAuth endpoints) — which is what `/:path*`
// meant. A function middleware would only cover server functions, i.e. the one
// surface that never renders in a browser frame.
//
// Not Nitro `routeRules` either: those only exist in the built output, so the
// headers would silently vanish under `vite dev` and any local `curl -I` check
// would be testing something the production image doesn't do (or vice versa).
//
// The returned `response` is what Start sends, so handing back a replacement is
// supported — and necessary: applySecurityHeaders cannot always mutate in place
// (see its doc comment on `Response.redirect`'s immutable headers).
const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  const result = await next()
  return { ...result, response: applySecurityHeaders(result.response) }
})

// CSRF for server functions. Start installs `createCsrfMiddleware` on its own
// only when the app declares no request middleware; declaring the one above
// switched it off, and every `/_serverFn/*` call took the session cookie from
// any page. The cookie is SameSite=Lax, and every *.toscanini.me host is the
// same site, so Lax alone let a sibling app's page write here (found
// 2026-10-02, security review).
//
// A browser sends Sec-Fetch-Site, which must be `same-origin`. Without it the
// Origin header decides, and it must be the public origin: behind the proxy
// `request.url` is the internal http URL, which no browser ever names, so the
// default comparison against it would refuse every Origin-only client.
// APP_PUBLIC_URL (set by the apps platform) is read off process.env, not
// ~/lib/env: these options are also in the client bundle (only the middleware
// body is server-only), and an env import would drag the validated server env
// in with them. A request with none of the three headers (curl) is refused.
// SSR calls server functions in-process and never comes through here.
function publicOrigin(): string | null {
  try {
    return new URL(process.env.APP_PUBLIC_URL ?? '').origin
  } catch {
    return null
  }
}

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
  origin: (value, ctx) => value === publicOrigin() || value === new URL(ctx.request.url).origin,
})

export const startInstance = createStart(() => ({
  // CSRF after the security headers, so a refusal carries them too.
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}))
