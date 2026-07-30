import { NextResponse, type NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { checkRateLimit, clientIpFromHeaders } from "~/lib/rate-limit";
import { validateBearer } from "~/lib/mcp/oauth/tokens";
import { resolveOrigin } from "~/lib/mcp/oauth/metadata";
import { createMcpCaller } from "~/lib/mcp/caller";
import { buildMcpServer } from "~/lib/mcp/server";

// MCP server endpoint. Streamable HTTP transport (June 2025 spec) — single URL
// for POST/GET/DELETE. Stateless: each request creates fresh transport+server,
// no shared state, no session id. Bearer-auth validated per request.
//
// `runtime = "nodejs"` is mandatory: the MCP SDK uses Node's crypto + streams
// and won't run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build a 401 + WWW-Authenticate response pointing at the protected-resource
// metadata URL. MCP clients are spec-required to follow this discovery hop
// and then drive the OAuth flow; we don't have to do anything else here.
function unauthorized(req: NextRequest): NextResponse {
  const origin = resolveOrigin(req);
  const metadataUrl = `${origin}/.well-known/oauth-protected-resource`;
  return new NextResponse(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized — connect via OAuth" },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer realm="anansi-mcp", resource_metadata="${metadataUrl}"`,
      },
    },
  );
}

async function handle(req: NextRequest): Promise<Response> {
  // Per-IP rate limit guards both the unauthed 401 path (probing) and authed
  // calls. 300/min is generous — bursts of tool calls during a Claude
  // conversation are common, but a runaway loop will trip this and the user
  // can recover by stopping the session.
  const ip = clientIpFromHeaders(req.headers);
  const rl = checkRateLimit("mcp_call", `ip:${ip}`, { limit: 300, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32099, message: "Rate limited" }, id: null },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (!bearer) return unauthorized(req);

  const auth = await validateBearer(bearer);
  if (!auth) return unauthorized(req);

  // Build the per-request server + caller. Stateless transport with JSON
  // responses (rather than SSE) keeps the proxy story simple; the MCP client
  // upgrades to SSE only when the server holds the response open for
  // long-running work, which we don't do for any current tool.
  const caller = createMcpCaller(auth.userId);
  const server = buildMcpServer(caller);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  // authInfo flows into tool handlers via the `extra` parameter — currently
  // unused by our tools (they get user identity from the closure-captured
  // caller) but populated for spec compliance.
  const response = await transport.handleRequest(req, {
    authInfo: {
      token: bearer,
      clientId: auth.clientId,
      scopes: auth.scope.split(/\s+/).filter(Boolean),
    },
  });
  // Best-effort cleanup so the per-request transport doesn't leak listeners.
  await transport.close().catch(() => undefined);
  return response;
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}
