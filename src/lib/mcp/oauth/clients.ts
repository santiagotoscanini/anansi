import { eq } from 'drizzle-orm'
import { db } from '../../data'
import { mcpOauthClients } from '../../data/schema'

// Minimum subset of RFC 7591 Dynamic Client Registration we accept. MCP clients
// are public (token_endpoint_auth_method = "none"), so no client_secret is ever
// issued. We deliberately ignore most metadata fields a real OAuth provider
// would surface (logo_uri, tos_uri, contacts, policy_uri…) — the consent screen
// shows the client_name and nothing else.

export interface RegisterClientInput {
  clientName: string
  redirectUris: string[]
}

export interface RegisteredClient {
  clientId: string
  clientName: string
  redirectUris: string[]
  grantTypes: string[]
  tokenEndpointAuthMethod: string
  scope: string
}

export async function registerClient(input: RegisterClientInput): Promise<RegisteredClient> {
  const [row] = await db
    .insert(mcpOauthClients)
    .values({
      clientName: input.clientName,
      redirectUris: input.redirectUris,
    })
    .returning()
  // INSERT … RETURNING always yields a row on success; the cast assures TS.
  if (!row) throw new Error('client insert returned no row')
  return {
    clientId: row.id,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    grantTypes: row.grantTypes,
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    scope: row.scope,
  }
}

export async function getClient(clientId: string): Promise<RegisteredClient | null> {
  const [row] = await db.select().from(mcpOauthClients).where(eq(mcpOauthClients.id, clientId)).limit(1)
  if (!row) return null
  return {
    clientId: row.id,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    grantTypes: row.grantTypes,
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    scope: row.scope,
  }
}

// Strict equality check — RFC 6749 §3.1.2 and OAuth 2.1 §1.5 both require
// exact match (no path prefix matching, no scheme upgrades). MCP clients
// pre-register their callback at /oauth/register so this is enforceable.
export function isRegisteredRedirectUri(client: RegisteredClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri)
}

// Basic shape check for redirect URIs at registration time. We accept https://
// plus http://localhost / 127.0.0.1 / [::1] (loopback dev) per OAuth 2.1 §8.4.2.
// Custom schemes for desktop clients (e.g. claude://) are also allowed since
// MCP clients legitimately use them — we don't restrict the scheme list.
export function isPlausibleRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:') {
      const host = u.hostname.toLowerCase()
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    }
    // Custom-scheme native callbacks (e.g. com.anthropic.claude://oauth/callback)
    // — accept as long as the scheme isn't javascript:/data:/file:.
    const banned = new Set(['javascript:', 'data:', 'file:', 'vbscript:'])
    return !banned.has(u.protocol)
  } catch {
    return false
  }
}
