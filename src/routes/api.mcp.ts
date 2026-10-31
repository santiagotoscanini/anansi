import { createFileRoute } from '@tanstack/react-router'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { checkRateLimit, clientIpFromHeaders } from '~/lib/rate-limit'
import { gatewayUserId } from '~/lib/mcp/gateway'
import { validateBearer } from '~/lib/mcp/oauth/tokens'
import { resolveOrigin } from '~/lib/mcp/oauth/metadata'
import { buildMcpServer } from '~/lib/mcp/server'

// MCP server endpoint. Streamable HTTP transport (June 2025 spec) — single URL
// for POST/GET/DELETE. Stateless: each request creates fresh transport+server,
// no shared state, no session id. Bearer-auth validated per request.
//
// This stays a plain server route rather than a server function, and that
// asymmetry is deliberate: server functions are Seroval-encoded and
// Origin-checked, so an MCP client could not call one. A bearer-authenticated
// server route is exactly what the spec expects and what `curl` can exercise.
//
// It must NEVER import ~/server/auth/session. MCP identity comes from
// `mcp_access_tokens` via validateBearer and has nothing to do with the
// browser session cookie; mixing the two would let a logged-in browser call
// tools without a token.

// Build a 401 + WWW-Authenticate response pointing at the protected-resource
// metadata URL. MCP clients are spec-required to follow this discovery hop
// and then drive the OAuth flow; we don't have to do anything else here.
function unauthorized(req: Request): Response {
  const metadataUrl = `${resolveOrigin(req)}/.well-known/oauth-protected-resource`
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized — connect via OAuth' },
      id: null,
    }),
    {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer realm="anansi-mcp", resource_metadata="${metadataUrl}"`,
      },
    },
  )
}

async function handle(req: Request): Promise<Response> {
  // Per-IP rate limit guards both the unauthed 401 path (probing) and authed
  // calls. 300/min is generous — bursts of tool calls during a Claude
  // conversation are common, but a runaway loop will trip this and the user
  // can recover by stopping the session.
  const ip = clientIpFromHeaders(req.headers)
  const rl = checkRateLimit('mcp_call', `ip:${ip}`, { limit: 300, windowMs: 60_000 })
  if (!rl.allowed) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32099, message: 'Rate limited' }, id: null },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  const authHeader = req.headers.get('authorization')
  const bearer = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null
  if (!bearer) return unauthorized(req)

  const gatewayUser = await gatewayUserId(req.headers, bearer)
  const auth = gatewayUser ? { userId: gatewayUser, clientId: 'gateway', scope: 'mcp' } : await validateBearer(bearer)
  if (!auth) return unauthorized(req)

  // Build the per-request server. Stateless transport with JSON responses
  // (rather than SSE) keeps the proxy story simple; the MCP client upgrades
  // to SSE only when the server holds the response open for long-running
  // work, which we don't do for any current tool.
  const server = buildMcpServer({ userId: auth.userId })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)

  // authInfo flows into tool handlers via the `extra` parameter — currently
  // unused by our tools (they get user identity from the closure-captured
  // McpCtx) but populated for spec compliance.
  const response = await transport.handleRequest(req, {
    authInfo: {
      token: bearer,
      clientId: auth.clientId,
      scopes: auth.scope.split(/\s+/).filter(Boolean),
    },
  })
  // Best-effort cleanup so the per-request transport doesn't leak listeners.
  await transport.close().catch(() => undefined)
  return response
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
