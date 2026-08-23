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
import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '~/lib/data'
import { accounts, files, users } from '~/lib/data/schema'
import { env, isOidcEmail } from '~/lib/env'
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
  inviteCode: users.inviteCode,
} as const

/**
 * The minimum password length, enforced at every write. 12 rather than a
 * conventional 8 because there is no MFA and no password reset — the hash is
 * the only thing standing between an email address and the account.
 */
const MIN_PASSWORD_LENGTH = 12

/**
 * Invite codes: 10 characters of a no-lookalike alphabet (same set iris uses
 * for its QR slugs), because a code gets read aloud and typed from a chat
 * message. Every user carries one: registration mints it here, and
 * adapter-created OIDC rows get theirs lazily in `me`. Any member's code
 * admits a new signup, so growth is member-to-member — the operator is one
 * inviter among many, not the door.
 */
const INVITE_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const INVITE_CODE_LENGTH = 10

/** crypto-random, no nanoid dependency — `randomInt` is unbiased. */
function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]
  }
  return code
}

/** Postgres unique-violation, the only insert error worth retrying. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505'
}

/**
 * Does some member own this code? Normalised to the mint alphabet's lowercase
 * before comparing, so a code pasted from a phone keyboard that capitalised it
 * still admits.
 */
async function inviteCodeExists(code: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.inviteCode, code.toLowerCase())).limit(1)
  return Boolean(row)
}

/** How an address is allowed to sign in. See `resolveLoginMethod`. */
export type LoginMethod = 'oidc' | 'password' | 'unknown'

/**
 * Create the users row for a new signup. Does NOT sign anyone in — the caller
 * follows up with Auth.js so this stays usable from a seed script.
 *
 * Email is lower-cased on the way in because `users.email` is UNIQUE and
 * Postgres compares it case-sensitively; without this, Sam@x.com and sam@x.com
 * are two accounts and only one of them can ever log in through a provider that
 * normalises.
 */
export async function registerUser(input: { name: string; email: string; password: string; inviteCode?: string }) {
  // (1) The deployment's front door — FIRST, so a caller who fails the invite
  // gate learns nothing about which addresses exist. `INVITE_CODE` being set
  // is what turns the gate ON; the codes that open it are every member's
  // personal one (`users.inviteCode`) plus that env value itself, kept as a
  // break-glass master so the door still opens if the database is empty.
  // Plain comparison rather than constant-time: the 3/hour/IP limit on the
  // server function is the actual defence — a timing oracle needs orders of
  // magnitude more attempts than that allows.
  if (env.INVITE_CODE) {
    const submitted = input.inviteCode?.trim() ?? ''
    const admitted = submitted !== '' && (submitted === env.INVITE_CODE || (await inviteCodeExists(submitted)))
    if (!admitted) throw new AppError('BAD_REQUEST', 'That invite code is not valid.')
  }

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()

  if (!name) throw new AppError('BAD_REQUEST', 'Name is required')

  // (2) ⚠ SECURITY. Addresses reserved for the IdP may never own a password
  // account. `allowDangerousEmailAccountLinking: false` in auth/config.ts
  // stops an OIDC sign-in from merging onto a pre-existing password row; this
  // stops that row from being created in the first place. Without both
  // halves, someone registers on the operator's address, waits, and either
  // inherits the identity (linking on) or permanently denies the operator
  // sign-in (off).
  if (isOidcEmail(email)) {
    throw new AppError(
      'BAD_REQUEST',
      `${email} signs in with ${env.OIDC_PROVIDER_NAME ?? 'Pocket ID'}. Use the single sign-on button instead of registering.`,
    )
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError('BAD_REQUEST', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists')

  const passwordHash = await bcrypt.hash(input.password, 10)

  // The new member is an inviter from the first second — their code is minted
  // with the row. Retried on a unique violation: a code collision is
  // vanishingly unlikely but not impossible, and the failure mode without the
  // retry is a 500 on signup.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [created] = await db
        .insert(users)
        .values({ name, email, passwordHash, inviteCode: generateInviteCode() })
        .returning(PROFILE_COLUMNS)
      if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create account')
      return { ...created, email }
    } catch (err) {
      // The email unique index throws 23505 too, but the pre-check above
      // already answered that with a CONFLICT; a violation here that is NOT
      // an invite-code collision is a race on the address — falling through
      // to the same conflict keeps the message honest either way.
      if (isUniqueViolation(err)) continue
      throw err
    }
  }

  throw new AppError('CONFLICT', 'An account with this email already exists')
}

/**
 * Which door an address should be sent through — the answer behind the
 * email-first login form.
 *
 * ⚠ `unknown` MUST NOT reach the browser as its own outcome. The server
 * function collapses it into `password`, so an address that does not exist and
 * an address that does are answered identically and the form cannot be used to
 * enumerate accounts. The three-way result exists here because the two
 * negative cases are genuinely different to a human reading the logs.
 *
 * The one signal this does emit is `oidc`, and it is bounded: an address in
 * `OIDC_EMAILS` is a static deployment constant (no signal about registrations
 * at all), and an address with an `accounts` row is an IdP-linked user — on
 * this deployment, the operator, whose address is in that list anyway.
 */
export async function resolveLoginMethod(email: string): Promise<LoginMethod> {
  const normalized = email.trim().toLowerCase()

  if (isOidcEmail(normalized)) return 'oidc'

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)
  if (!user) return 'unknown'
  if (user.passwordHash) return 'password'

  // No hash: either an IdP-linked account (send it to the IdP) or a row in a
  // state that cannot sign in at all (treated as unknown → the password form,
  // where the credentials provider returns null like it would anyway).
  const [linked] = await db
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .limit(1)

  return linked ? 'oidc' : 'unknown'
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

  // Lazy mint for the rows the Auth.js adapter created (OIDC sign-ins bypass
  // `registerUser`, so they arrive without an invite code). `isNull` in the
  // WHERE is the race guard: two concurrent first-reads both try, one row
  // matches once, the loser reads back the winner's code. Idempotent, so fine
  // in a GET.
  let inviteCode = row.inviteCode
  for (let attempt = 0; inviteCode === null && attempt < 5; attempt++) {
    try {
      const [minted] = await db
        .update(users)
        .set({ inviteCode: generateInviteCode() })
        .where(and(eq(users.id, userId), isNull(users.inviteCode)))
        .returning({ inviteCode: users.inviteCode })
      inviteCode = minted
        ? minted.inviteCode
        : ((await db.query.users.findFirst({ where: eq(users.id, userId), columns: { inviteCode: true } }))
            ?.inviteCode ?? null)
    } catch (err) {
      if (isUniqueViolation(err)) continue
      throw err
    }
  }

  return { ...row, inviteCode }
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
