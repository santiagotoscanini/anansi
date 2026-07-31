import { createFileRoute } from '@tanstack/react-router'
import { protectedResourceMetadata, resolveOrigin } from '~/lib/mcp/oauth/metadata'

// RFC 9728. The MCP server's 401 WWW-Authenticate header points here so an
// unauthenticated client can self-bootstrap discovery. See the sibling
// authorization-server route for why the filename starts with `[.]`.
export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json(protectedResourceMetadata(resolveOrigin(request)), {
          headers: { 'cache-control': 'public, max-age=300' },
        }),
    },
  },
})
