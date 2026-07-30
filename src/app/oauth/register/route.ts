import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, clientIpFromHeaders } from '~/lib/rate-limit'
import { isPlausibleRedirectUri, registerClient } from '~/lib/mcp/oauth/clients'
import { appendAudit } from '~/lib/mcp/oauth/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// RFC 7591 Dynamic Client Registration. We accept the minimum subset MCP
// clients send and ignore the rest. Any field shape that violates the spec
// or our subset returns 400 with `invalid_client_metadata` so Claude's
// discovery layer can surface a sensible error.
const registerBodySchema = z.object({
  client_name: z.string().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
})

function errorResponse(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status })
}

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers)

  // Rate limit per IP: registration is unauthenticated, so it's a natural
  // abuse target. 5 per minute is generous for legit Claude clients (one
  // registration per machine-per-app, persisted client-side after) and
  // tight enough to make scripted scanning expensive.
  const rl = checkRateLimit('mcp_register', `ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', error_description: 'too many registration attempts' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_client_metadata', 'request body must be JSON')
  }

  const parsed = registerBodySchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse('invalid_client_metadata', parsed.error.issues[0]?.message ?? 'invalid shape')
  }

  // Reject malformed callbacks early — pre-registration is the only chance
  // to catch them; runtime validation only checks exact-match against this
  // list. http://localhost is allowed; arbitrary http:// is not.
  for (const uri of parsed.data.redirect_uris) {
    if (!isPlausibleRedirectUri(uri)) {
      return errorResponse('invalid_redirect_uri', `rejected redirect_uri: ${uri}`)
    }
  }

  // We only support PKCE-public clients. If a client tries to register as
  // confidential, refuse rather than silently downgrade — the resulting
  // confusion at token-exchange time would be worse.
  if (parsed.data.token_endpoint_auth_method && parsed.data.token_endpoint_auth_method !== 'none') {
    return errorResponse(
      'invalid_client_metadata',
      `unsupported token_endpoint_auth_method; only "none" (PKCE public clients) is accepted`,
    )
  }

  const client = await registerClient({
    clientName: parsed.data.client_name ?? 'Unnamed MCP client',
    redirectUris: parsed.data.redirect_uris,
  })

  await appendAudit({
    event: 'register',
    clientId: client.clientId,
    ip,
    meta: { clientName: client.clientName, redirectUris: client.redirectUris },
  })

  // RFC 7591 response shape. We don't issue a `client_secret` (public client)
  // and we don't expire credentials. `client_id_issued_at` is informational.
  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      scope: client.scope,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 },
  )
}
