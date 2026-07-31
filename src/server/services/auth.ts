// The users row: profile reads/writes, plus the two credential operations that
// are pure database work.
//
// What is NOT here is anything that touches the session cookie. Sign-in and
// sign-out are Auth.js's job (src/server/auth/actions.ts) — this file owns the
// `users` row, they own the cookie, and `registerUser` below returns rather
// than signing in so the seam stays clean and the whole thing stays callable
// from a script.
//
// Avatar bytes live in the `files` table and are served by /api/files/[id];
// users.avatarUrl holds a `/api/files/{id}` pointer, or null for the initials
// fallback in Avatar.tsx.
import bcrypt from 'bcryptjs'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '~/lib/data'
import { files, users } from '~/lib/data/schema'
import { decodeImageUpload, UploadValidationError } from '~/lib/image-upload'
import { checkRateLimit } from '~/lib/rate-limit'
import { AppError } from './errors'
import { fileUrl, parseFileId } from './file-refs'

/**
 * The exact column set every profile-returning endpoint exposes. Declared once
 * so `me`, `updateProfile`, `uploadAvatar`, `removeAvatar` and `setLocale` can
 * never drift into returning different shapes — the client caches them into the
 * same query.
 */
const PROFILE_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  locale: users.locale,
} as const

/**
 * The minimum password length, enforced at every write. 12 rather than a
 * conventional 8 because there is no rate-limited login, no MFA and no password
 * reset — the hash is the only thing standing between an email address and the
 * account.
 */
const MIN_PASSWORD_LENGTH = 12

/**
 * Create the users row for a new signup. Does NOT sign anyone in — the caller
 * follows up with Auth.js so this stays usable from a seed script.
 *
 * Email is lower-cased on the way in because `users.email` is UNIQUE and
 * Postgres compares it case-sensitively; without this, Sam@x.com and sam@x.com
 * are two accounts and only one of them can ever log in through a provider that
 * normalises.
 */
export async function registerUser(input: { name: string; email: string; password: string }) {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()

  if (!name) throw new AppError('BAD_REQUEST', 'Name is required')
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError('BAD_REQUEST', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists')

  const passwordHash = await bcrypt.hash(input.password, 10)
  const [created] = await db.insert(users).values({ name, email, passwordHash }).returning(PROFILE_COLUMNS)
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create account')

  return { ...created, email }
}

/**
 * Change the password of a signed-in user, re-authenticating with the current
 * one first. That check is not redundant with the session: it is what stops a
 * borrowed unlocked laptop from becoming a permanent account takeover.
 */
export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user?.passwordHash) throw new AppError('BAD_REQUEST', 'No password set on this account.')

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!ok) throw new AppError('BAD_REQUEST', 'Current password is incorrect')

  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError('BAD_REQUEST', `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10)
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id))
}

export async function me(userId: string) {
  const [row] = await db.select(PROFILE_COLUMNS).from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'User not found')
  return row
}

export async function updateProfile(userId: string, input: { name?: string; email?: string }) {
  if (input.email) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, input.email), ne(users.id, userId)))
      .limit(1)
    if (existing) throw new AppError('CONFLICT', 'Email already in use')
  }

  // Seeded with the audit column rather than left to `timestamps.$onUpdate`,
  // because every other field here is optional and drizzle rejects `.set({})`
  // outright with "No values to set" — that check runs BEFORE $onUpdate is
  // applied, so it cannot fill an otherwise-empty patch. `updateProfile({})` is
  // valid input, so without this seed it would throw instead of no-op.
  const patch: { name?: string; email?: string; updatedAt: Date } = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.email !== undefined) patch.email = input.email

  const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning(PROFILE_COLUMNS)
  return updated
}

/**
 * Insert the new blob first, repoint users.avatarUrl at it, and only then drop
 * the old blob — so a partial failure leaves the avatar pointing at something
 * that still exists rather than at a deleted row.
 */
export async function uploadAvatar(userId: string, input: { fileName: string; data: string }) {
  const rl = checkRateLimit('auth.uploadAvatar', `user:${userId}`, { limit: 10, windowMs: 60_000 })
  if (!rl.allowed) throw new AppError('TOO_MANY_REQUESTS', 'Too many uploads, slow down')

  let decoded
  try {
    decoded = decodeImageUpload(input.data)
  } catch (err) {
    if (err instanceof UploadValidationError) throw new AppError('BAD_REQUEST', err.message)
    throw err
  }

  const [file] = await db
    .insert(files)
    .values({
      ownerId: userId,
      fileName: input.fileName,
      mimeType: decoded.mime ?? 'application/octet-stream',
      sizeBytes: decoded.buffer.length,
      data: decoded.buffer,
    })
    .returning({ id: files.id })
  if (!file) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to store avatar')

  const [prev] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1)

  const [updated] = await db
    .update(users)
    .set({ avatarUrl: fileUrl(file.id) })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS)

  await deleteOwnedFile(userId, prev?.avatarUrl ?? null)
  return updated
}

export async function removeAvatar(userId: string) {
  const [prev] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1)

  const [updated] = await db
    .update(users)
    .set({ avatarUrl: null })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS)

  await deleteOwnedFile(userId, prev?.avatarUrl ?? null)
  return updated
}

/**
 * Persist the user's UI language. Source of truth for supported codes is
 * src/i18n/config.ts — keep the caller's enum in sync when adding a language.
 */
export async function setLocale(userId: string, locale: 'en' | 'es') {
  const [updated] = await db.update(users).set({ locale }).where(eq(users.id, userId)).returning(PROFILE_COLUMNS)
  return updated
}

/** Drop a previously-referenced blob, ownership-gated. No-op for foreign URLs. */
async function deleteOwnedFile(userId: string, url: string | null) {
  const fileId = parseFileId(url)
  if (!fileId) return
  await db.delete(files).where(and(eq(files.id, fileId), eq(files.ownerId, userId)))
}
