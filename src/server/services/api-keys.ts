// API keys for the phone app's REST API (/api/v1/*).
//
// A key is created by a signed-in user on the web, shown to them exactly once,
// and stored only as its SHA-256 hash. It never expires; the user revokes it.
// The raw form is `ank_` + 32 random bytes in base64url, so it is recognizable
// in a leak scan and cannot be confused with an MCP token (`mcp_at_…`).
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '~/lib/data'
import { apiKeys } from '~/lib/data/schema'
import { AppError } from './errors'

const PREFIX = 'ank_'
/** How many characters of the raw key the list shows, prefix included. */
const SHOWN = 12
/** `last_used_at` is written at most this often per key, not on every request. */
const TOUCH_EVERY_MS = 60_000
/** A user can hold this many live keys: one per device is the expected use. */
const MAX_LIVE_KEYS = 20

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** The user's live keys, newest first. Nothing secret: the hash stays here. */
export async function list(userId: string) {
  return await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt))
}

/** Creates a key and returns it with its raw value, which is never readable again. */
export async function create(userId: string, input: { name: string }) {
  const live = await list(userId)
  if (live.length >= MAX_LIVE_KEYS) {
    throw new AppError('BAD_REQUEST', `You can hold ${MAX_LIVE_KEYS} keys at a time. Revoke one first.`)
  }
  const raw = `${PREFIX}${randomBytes(32).toString('base64url')}`
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: input.name, prefix: raw.slice(0, SHOWN), tokenHash: hashKey(raw) })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
  if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create the key')
  return { ...row, key: raw }
}

export async function revoke(userId: string, id: string) {
  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  if (updated.length === 0) throw new AppError('NOT_FOUND', 'Key not found or access denied')
  return { success: true }
}

/** The user a presented key belongs to, or null for anything else (unknown, revoked, malformed). */
export async function authenticate(raw: string): Promise<{ userId: string; keyId: string } | null> {
  if (!raw.startsWith(PREFIX) || raw.length < 20 || raw.length > 100) return null
  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.tokenHash, hashKey(raw)), isNull(apiKeys.revokedAt)))
    .limit(1)
  if (!row) return null
  const now = Date.now()
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiKeys.id, row.id))
  }
  return { userId: row.userId, keyId: row.id }
}
