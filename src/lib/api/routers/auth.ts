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

// Map sniffed MIME → canonical file extension for the on-disk avatar/photo
// path. We always trust the magic bytes over the user-supplied filename so
// a `.png` carrying JPEG payload lands as `avatar.jpg`.
const MIME_TO_EXT: Record<NonNullable<ReturnType<typeof decodeImageUpload>["mime"]>, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

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
      const ext = MIME_TO_EXT[decoded.mime!];
      const userDir = path.join(UPLOADS_ROOT, ctx.user.userId);
      if (!existsSync(userDir)) await mkdir(userDir, { recursive: true });
      const fileName = `avatar${ext}`;
      const fullPath = path.join(userDir, fileName);
      // Best-effort: clean up old avatar files with different extensions so we
      // don't leak stale ones (e.g. old .jpg when new is .png).
      for (const oldExt of [".png", ".jpg", ".jpeg", ".gif", ".webp"]) {
        if (oldExt === ext) continue;
        const oldPath = path.join(userDir, `avatar${oldExt}`);
        if (existsSync(oldPath)) {
          try {
            await unlink(oldPath);
          } catch {
            /* swallow — best-effort cleanup */
          }
        }
      }
      await writeFile(fullPath, decoded.buffer);
      const avatarUrl = `/uploads/${ctx.user.userId}/${fileName}`;
      const [updated] = await db
        .update(users)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.userId))
        .returning({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl });
      return updated;
    }),

  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const userDir = path.join(UPLOADS_ROOT, ctx.user.userId);
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp"]) {
      const p = path.join(userDir, `avatar${ext}`);
      if (existsSync(p)) {
        try {
          await unlink(p);
        } catch {
          /* swallow */
        }
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
