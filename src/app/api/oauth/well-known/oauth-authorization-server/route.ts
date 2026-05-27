import { NextResponse, type NextRequest } from "next/server";
import { authorizationServerMetadata, resolveOrigin } from "~/lib/mcp/oauth/metadata";

// RFC 8414. Public, cache-friendly. The MCP client fetches this once at
// discovery time to learn the authorization/token/registration endpoints.
//
// Reached via the `/.well-known/oauth-authorization-server` rewrite in
// next.config.js — never link to this internal path directly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // origin depends on x-forwarded-* headers

export function GET(req: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(resolveOrigin(req)), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
