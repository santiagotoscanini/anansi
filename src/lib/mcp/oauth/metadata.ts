import { ALL_SCOPES } from './scopes'

// Resolve the public origin of the server from the request headers. We honor
// the standard reverse-proxy headers (x-forwarded-{proto,host}) since Anansi
// runs behind one in prod; fall back to the request URL for local dev.
//
// This matters because OAuth metadata documents include absolute URLs that
// the MCP client must reach back at — if the issuer claim is wrong, Claude's
// PKCE/state binding fails.
export function resolveOrigin(req: Request): string {
  const headers = req.headers
  const proto = headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(/:$/, '')
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? new URL(req.url).host
  return `${proto}://${host}`
}

// RFC 8414 Authorization Server Metadata. The MCP client fetches this to learn
// where to send authorize / token / register / revoke requests, what grants we
// support, and what scopes exist. Keep the field names exactly as the RFC
// defines them — Claude's discovery layer is strict.
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...ALL_SCOPES],
  } as const
}

// RFC 9728 Protected Resource Metadata. The MCP server returns this from the
// /.well-known/oauth-protected-resource endpoint and points 401 responses at
// it via WWW-Authenticate so unauthenticated clients can self-bootstrap.
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: [...ALL_SCOPES],
  } as const
}
