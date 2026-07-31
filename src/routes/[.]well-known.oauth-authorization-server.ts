import { createFileRoute } from '@tanstack/react-router'
import { authorizationServerMetadata, resolveOrigin } from '~/lib/mcp/oauth/metadata'

// RFC 8414. Public, cache-friendly. The MCP client fetches this once at
// discovery time to learn the authorization/token/registration endpoints.
//
// The `[.]` in the filename is TanStack Router's escape for a literal dot, so
// this serves `/.well-known/oauth-authorization-server` directly. Next could
// not host a `.well-known` directory under app/, which is why the Next version
// lived at /api/oauth/well-known/* behind a rewrite in next.config.js — that
// indirection is gone, and the public URL is unchanged.
export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json(authorizationServerMetadata(resolveOrigin(request)), {
          headers: { 'cache-control': 'public, max-age=300' },
        }),
    },
  },
})
