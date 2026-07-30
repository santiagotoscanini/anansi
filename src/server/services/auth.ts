// Profile reads/writes against the local users row.
//
// Sign-in / sign-up / sign-out / password change are NOT here — they flow
// through Auth.js server actions in src/app/auth/actions.ts. This file is only
// the authenticated profile surface.
//
// Avatar bytes live in the `files` table and are served by /api/files/[id];
// users.avatarUrl holds a `/api/files/{id}` pointer, or null for the initials
// fallback in Avatar.tsx.
import { and, eq, ne } from "drizzle-orm";
import { db } from "~/lib/data";
import { files, users } from "~/lib/data/schema";
import { decodeImageUpload, UploadValidationError } from "~/lib/image-upload";
import { checkRateLimit } from "~/lib/rate-limit";
import { AppError } from "./errors";
import { fileUrl, parseFileId } from "./file-refs";

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
} as const;

export async function me(userId: string) {
  const [row] = await db.select(PROFILE_COLUMNS).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "User not found");
  return row;
}

export async function updateProfile(userId: string, input: { name?: string; email?: string }) {
  if (input.email) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, input.email), ne(users.id, userId)))
      .limit(1);
    if (existing) throw new AppError("CONFLICT", "Email already in use");
  }

  const patch: { name?: string; email?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;

  const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning(PROFILE_COLUMNS);
  return updated;
}

/**
 * Insert the new blob first, repoint users.avatarUrl at it, and only then drop
 * the old blob — so a partial failure leaves the avatar pointing at something
 * that still exists rather than at a deleted row.
 */
export async function uploadAvatar(userId: string, input: { fileName: string; data: string }) {
  const rl = checkRateLimit("auth.uploadAvatar", `user:${userId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) throw new AppError("TOO_MANY_REQUESTS", "Too many uploads, slow down");

  let decoded;
  try {
    decoded = decodeImageUpload(input.data);
  } catch (err) {
    if (err instanceof UploadValidationError) throw new AppError("BAD_REQUEST", err.message);
    throw err;
  }

  const [file] = await db
    .insert(files)
    .values({
      ownerId: userId,
      fileName: input.fileName,
      mimeType: decoded.mime ?? "application/octet-stream",
      sizeBytes: decoded.buffer.length,
      data: decoded.buffer,
    })
    .returning({ id: files.id });
  if (!file) throw new AppError("INTERNAL_SERVER_ERROR", "Failed to store avatar");

  const [prev] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);

  const [updated] = await db
    .update(users)
    .set({ avatarUrl: fileUrl(file.id), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS);

  await deleteOwnedFile(userId, prev?.avatarUrl ?? null);
  return updated;
}

export async function removeAvatar(userId: string) {
  const [prev] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);

  const [updated] = await db
    .update(users)
    .set({ avatarUrl: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS);

  await deleteOwnedFile(userId, prev?.avatarUrl ?? null);
  return updated;
}

/**
 * Persist the user's UI language. Source of truth for supported codes is
 * src/i18n/config.ts — keep the caller's enum in sync when adding a language.
 */
export async function setLocale(userId: string, locale: "en" | "es") {
  const [updated] = await db
    .update(users)
    .set({ locale, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS);
  return updated;
}

/** Drop a previously-referenced blob, ownership-gated. No-op for foreign URLs. */
async function deleteOwnedFile(userId: string, url: string | null) {
  const fileId = parseFileId(url);
  if (!fileId) return;
  await db.delete(files).where(and(eq(files.id, fileId), eq(files.ownerId, userId)));
}
