import { eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { users } from '~/lib/data/schema'
import { env } from '~/lib/env'
import { cameThroughTunnel, tokenMatches } from './gateway-token'

// The LLM gateway's way into the MCP server, beside the OAuth clients. The box's
// gateway dials this container directly, behind its own Pocket ID sign-in, with a
// token the box generates, and acts for one account (MCP_USER_EMAIL).
//
// The app is public, so a token alone must not be enough: a request through the
// tunnel is refused here and falls through to OAuth. That keeps the gateway's
// sign-in the only way to use this token from outside.

/** The account the gateway acts for, or null when this is not the gateway. */
export async function gatewayUserId(headers: Headers, bearer: string | null | undefined) {
  if (cameThroughTunnel(headers) || !tokenMatches(bearer, env.ANANSI_MCP_TOKEN)) return null
  const email = env.MCP_USER_EMAIL?.trim().toLowerCase()
  if (!email) return null
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  return row?.id ?? null
}
