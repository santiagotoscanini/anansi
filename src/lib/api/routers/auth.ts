import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { validatePassword, hashPassword } from "../../auth-server";
import { db } from "../../data";
import { users } from "../../data/schema";
import { and, eq, ne } from "drizzle-orm";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { decodeImageUpload, UploadValidationError } from "../../image-upload";
import { checkRateLimit } from "../../rate-limit";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Avatars always live at one fixed path per user — `uploads/{userId}/avatar`,
// no extension. Each upload overwrites the same file so we never need to
// clean up alternate-format leftovers, and there's no orphaning surface when
// a delete-loop swallows an error. The serving route in
// `src/app/uploads/[...path]/route.ts` falls back to magic-byte mime sniffing
// when an extensionless file is requested.
const AVATAR_FILENAME = "avatar";

// Auth state changes (login, register, logout) live in dedicated Next route
// handlers under src/app/api/auth/* so they can set HttpOnly cookies on the
// response. tRPC procedures here only handle authenticated profile reads/writes.
export const authRouter = createTRPCRouter({
  // Authenticated profile read for the current user.
  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, ctx.user.userId))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return row;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Block email collisions with someone else's account.
      if (input.email) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, input.email), ne(users.id, ctx.user.userId)))
          .limit(1);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
      }
      const patch: { name?: string; email?: string; updatedAt: Date } = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.email !== undefined) patch.email = input.email;
      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, ctx.user.userId))
        .returning({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl });
      return updated;
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        // See register/route.ts — 12 char baseline.
        newPassword: z.string().min(12, "New password must be at least 12 characters"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [row] = await db.select().from(users).where(eq(users.id, ctx.user.userId)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      const ok = await validatePassword(input.currentPassword, row.password);
      if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Current password is incorrect" });
      const hashed = await hashPassword(input.newPassword);
      await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, ctx.user.userId));
      return { success: true };
    }),

  // Avatar upload — base64 image payload, written to uploads/{userId}/avatar.{ext}.
  // Replaces any existing avatar file (best-effort unlink first). Returns the
  // updated user row including the new avatarUrl, ready for cache priming.
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        // data: base64 with optional data: prefix. Size + magic-byte validated below.
        data: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // 10 avatar uploads per minute per user is plenty for legitimate use
      // (cropping retries, format swaps) and stops a runaway client loop.
      const rl = checkRateLimit("auth.uploadAvatar", `user:${ctx.user.userId}`, { limit: 10, windowMs: 60_000 });
      if (!rl.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many uploads, slow down" });
      }
      let decoded;
      try {
        decoded = decodeImageUpload(input.data);
      } catch (err) {
        if (err instanceof UploadValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
      const userDir = path.join(UPLOADS_ROOT, ctx.user.userId);
      if (!existsSync(userDir)) await mkdir(userDir, { recursive: true });
      const fullPath = path.join(userDir, AVATAR_FILENAME);
      await writeFile(fullPath, decoded.buffer);
      // Cache-bust on every upload — the file path is stable so without a
      // version query the browser would serve the previous bytes for up to
      // 24h (private,max-age=86400 in the upload-serving route).
      const avatarUrl = `/uploads/${ctx.user.userId}/${AVATAR_FILENAME}?v=${Date.now()}`;
      const [updated] = await db
        .update(users)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.userId))
        .returning({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl });
      return updated;
    }),

  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const userDir = path.join(UPLOADS_ROOT, ctx.user.userId);
    const avatarPath = path.join(userDir, AVATAR_FILENAME);
    if (existsSync(avatarPath)) {
      try {
        await unlink(avatarPath);
      } catch (err) {
        // Don't swallow silently — if delete fails we want to know in logs;
        // the user-facing flow still succeeds (avatarUrl is cleared in DB
        // either way) so we don't propagate the error.
        console.warn(`[auth.removeAvatar] failed to unlink ${avatarPath}:`, err);
      }
    }
    const [updated] = await db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.userId))
      .returning({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl });
    return updated;
  }),
});
