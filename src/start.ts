import { createMiddleware, createStart } from '@tanstack/react-start'
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
const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  const result = await next()
  applySecurityHeaders(result.response)
  return result
})

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}))
