import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../../data'
import { mcpAccessTokens, mcpRefreshTokens } from '../../data/schema'
import { generateToken, hashToken } from './store'

// Token lifetimes. Access is short (1h) so even a leak self-heals; refresh is
// 30 days, rotating on every use. The MCP client transparently refreshes when
// the AS returns 401 and `WWW-Authenticate: Bearer error="invalid_token"`.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds
  tokenType: 'Bearer'
  scope: string
}

// Mint a fresh (access, refresh) pair for the given (user, client, scope).
// Atomically revokes any prior tokens for the same pair — one active grant
// per (user, client). Reconnecting from a new device invalidates the old one.
export async function issueTokenPair(args: { userId: string; clientId: string; scope: string }): Promise<TokenPair> {
  const access = generateToken('mcp_at')
  const refresh = generateToken('mcp_rt')
  const accessHash = hashToken(access)
  const refreshHash = hashToken(refresh)
  const now = new Date()

  await db.transaction(async (tx) => {
    // Revoke prior tokens for this (user, client) — keeps the active-grants
    // set small and prevents a stolen-then-rotated token from coexisting
    // with a freshly minted one.
    await tx
      .update(mcpAccessTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(mcpAccessTokens.userId, args.userId),
          eq(mcpAccessTokens.clientId, args.clientId),
          isNull(mcpAccessTokens.revokedAt),
        ),
      )
    await tx
      .update(mcpRefreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(mcpRefreshTokens.userId, args.userId),
          eq(mcpRefreshTokens.clientId, args.clientId),
          isNull(mcpRefreshTokens.revokedAt),
        ),
      )

    await tx.insert(mcpAccessTokens).values({
      tokenHash: accessHash,
      userId: args.userId,
      clientId: args.clientId,
      scope: args.scope,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
    })
    await tx.insert(mcpRefreshTokens).values({
      tokenHash: refreshHash,
      userId: args.userId,
      clientId: args.clientId,
      scope: args.scope,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    })
  })

  return {
    accessToken: access,
    refreshToken: refresh,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    tokenType: 'Bearer',
    scope: args.scope,
  }
}

// Rotating refresh: the presented refresh token is consumed (revoked + marked
// `rotated_to` for audit) and replaced with a fresh pair. Inside a tx with
// SELECT … FOR UPDATE so two concurrent refreshes can't both succeed — the
// loser sees the row already revoked and gets an `invalid_grant`.
//
// Returns null on any failure (unknown / expired / already-revoked) — the
// caller maps that to RFC 6749 `invalid_grant` without leaking the reason.
export async function rotateRefreshToken(
  presentedRefresh: string,
  clientId: string,
): Promise<{ tokenPair: TokenPair; userId: string } | null> {
  const presentedHash = hashToken(presentedRefresh)
  const now = new Date()
  const access = generateToken('mcp_at')
  const refresh = generateToken('mcp_rt')
  const accessHash = hashToken(access)
  const refreshHash = hashToken(refresh)

  return await db.transaction(async (tx) => {
    // Row lock to serialize concurrent refreshes on the same token.
    const [row] = await tx.execute<{
      id: string
      user_id: string
      client_id: string
      scope: string
      expires_at: string
      revoked_at: Date | null
    }>(
      sql`SELECT id, user_id, client_id, scope, expires_at, revoked_at FROM mcp_refresh_tokens WHERE token_hash = ${presentedHash} FOR UPDATE`,
    )
    if (!row) return null
    if (row.client_id !== clientId) return null
    if (row.revoked_at !== null) return null
    // A raw query leaves timestamps as strings, and `string <= Date` is always false.
    if (new Date(row.expires_at) <= now) return null

    const [newRefresh] = await tx
      .insert(mcpRefreshTokens)
      .values({
        tokenHash: refreshHash,
        userId: row.user_id,
        clientId: row.client_id,
        scope: row.scope,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      })
      .returning({ id: mcpRefreshTokens.id })
    if (!newRefresh) return null

    // Mark the consumed refresh as revoked + record the replacement's id for
    // the audit trail. Done after the new row insert so rotation_to refers
    // to a row that exists.
    await tx
      .update(mcpRefreshTokens)
      .set({ revokedAt: now, rotatedTo: newRefresh.id })
      .where(eq(mcpRefreshTokens.id, row.id))

    // Revoke prior access tokens for this grant — the fresh access token is
    // the only one we want live going forward.
    await tx
      .update(mcpAccessTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(mcpAccessTokens.userId, row.user_id),
          eq(mcpAccessTokens.clientId, row.client_id),
          isNull(mcpAccessTokens.revokedAt),
        ),
      )

    await tx.insert(mcpAccessTokens).values({
      tokenHash: accessHash,
      userId: row.user_id,
      clientId: row.client_id,
      scope: row.scope,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
    })

    return {
      userId: row.user_id,
      tokenPair: {
        accessToken: access,
        refreshToken: refresh,
        expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        tokenType: 'Bearer',
        scope: row.scope,
      },
    }
  })
}

export interface ValidatedBearer {
  userId: string
  clientId: string
  scope: string
}

// Resolve an Authorization: Bearer header into the owning user. Single hot path
// per MCP request: hash → indexed lookup. Returns null on any failure — the
// caller surfaces 401 with WWW-Authenticate so the MCP client knows to refresh.
//
// This used to innerJoin `users` to carry a display name through to the tRPC
// context, but nothing read it. The join is not needed to prove the user still
// exists either: `mcp_access_tokens.user_id` is a cascade FK, so a deleted user
// takes their tokens with them.
export async function validateBearer(rawToken: string): Promise<ValidatedBearer | null> {
  if (!rawToken) return null
  const tokenHash = hashToken(rawToken)
  const [row] = await db
    .select({
      userId: mcpAccessTokens.userId,
      clientId: mcpAccessTokens.clientId,
      scope: mcpAccessTokens.scope,
    })
    .from(mcpAccessTokens)
    .where(
      and(
        eq(mcpAccessTokens.tokenHash, tokenHash),
        isNull(mcpAccessTokens.revokedAt),
        gt(mcpAccessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!row) return null
  return {
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
  }
}

// RFC 7009 revocation. Try access token first (most common — the client tends
// to revoke the access token on logout), fall back to refresh. We return void
// either way per the spec ("the authorization server responds with HTTP 200 if
// the token has been revoked successfully or if the client submitted an
// invalid token").
export async function revokeToken(token: string, hint?: 'access_token' | 'refresh_token'): Promise<void> {
  const tokenHash = hashToken(token)
  const now = new Date()

  const tryAccess = async () => {
    const [row] = await db
      .update(mcpAccessTokens)
      .set({ revokedAt: now })
      .where(and(eq(mcpAccessTokens.tokenHash, tokenHash), isNull(mcpAccessTokens.revokedAt)))
      .returning({ id: mcpAccessTokens.id })
    return row?.id ?? null
  }
  const tryRefresh = async () => {
    const [row] = await db
      .update(mcpRefreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(mcpRefreshTokens.tokenHash, tokenHash), isNull(mcpRefreshTokens.revokedAt)))
      .returning({ id: mcpRefreshTokens.id })
    return row?.id ?? null
  }

  if (hint === 'refresh_token') {
    if (await tryRefresh()) return
    await tryAccess()
    return
  }
  if (await tryAccess()) return
  await tryRefresh()
}

// Revoke every active access + refresh token for (user, client). Called from
// the consent screen's "disconnect" flow if we ever expose one — also handy
// internally when re-consenting at a new scope.
export async function revokeAllForGrant(userId: string, clientId: string): Promise<void> {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(mcpAccessTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(mcpAccessTokens.userId, userId),
          eq(mcpAccessTokens.clientId, clientId),
          isNull(mcpAccessTokens.revokedAt),
        ),
      )
    await tx
      .update(mcpRefreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(mcpRefreshTokens.userId, userId),
          eq(mcpRefreshTokens.clientId, clientId),
          isNull(mcpRefreshTokens.revokedAt),
        ),
      )
  })
}
