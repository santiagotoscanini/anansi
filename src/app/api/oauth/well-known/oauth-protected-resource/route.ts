import { NextResponse, type NextRequest } from 'next/server'
import { protectedResourceMetadata, resolveOrigin } from '~/lib/mcp/oauth/metadata'

// RFC 9728. The MCP server's 401 WWW-Authenticate header points here so an
// unauthenticated client can self-bootstrap discovery.
//
// Reached via the `/.well-known/oauth-protected-resource` rewrite in
// next.config.js.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(resolveOrigin(req)), {
    headers: { 'cache-control': 'public, max-age=300' },
  })
}
