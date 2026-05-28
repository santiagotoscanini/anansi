import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { db } from "../../data";
import { files, users } from "../../data/schema";
import { and, eq, ne } from "drizzle-orm";
import { decodeImageUpload, UploadValidationError } from "../../image-upload";
import { checkRateLimit } from "../../rate-limit";
import { fileUrl } from "./goals/_shared";

// Profile reads/writes against the local users mirror. Sign-in / sign-up /
// sign-out / password change all flow through server actions in
// src/app/auth/actions.ts (Auth.js). Avatar bytes live in the `files` table
// and are served by the /api/files/[id] route; `users.avatarUrl` is a
// pointer of the form `/api/files/{fileId}` (or null for the initials
// fallback).
export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      })
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
      const [updated] = await db.update(users).set(patch).where(eq(users.id, ctx.user.userId)).returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      });
      return updated;
    }),

  // Avatar upload — base64 image payload, persisted to the `files` table.
  // We insert a fresh files row, point `users.avatarUrl` at the new file's
  // URL, then delete the previous file row (if any). Inserts then updates so
  // a partial failure leaves the avatar pointing at something valid.
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        // base64 with optional data: prefix. Size + magic-byte validated below.
        data: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
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

      const contentType = decoded.mime ?? "application/octet-stream";
      const [file] = await db
        .insert(files)
        .values({
          ownerId: ctx.user.userId,
          fileName: input.fileName,
          mimeType: contentType,
          sizeBytes: decoded.buffer.length,
          data: decoded.buffer,
        })
        .returning({ id: files.id });
      if (!file) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to store avatar" });

      // Find the prior avatar (if any) so we can drop its blob after the
      // update. Storing as URL means we have to parse the id back out.
      const [prev] = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, ctx.user.userId))
        .limit(1);

      const [updated] = await db
        .update(users)
        .set({ avatarUrl: fileUrl(file.id), updatedAt: new Date() })
        .where(eq(users.id, ctx.user.userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          locale: users.locale,
        });

      const prevId = parseFileId(prev?.avatarUrl ?? null);
      if (prevId) {
        await db.delete(files).where(and(eq(files.id, prevId), eq(files.ownerId, ctx.user.userId)));
      }
      return updated;
    }),

  // Persist the user's UI language. Source of truth for supported codes lives
  // in src/i18n/config.ts; keep this enum in sync when adding a language.
  setLocale: protectedProcedure.input(z.object({ locale: z.enum(["en", "es"]) })).mutation(async ({ input, ctx }) => {
    const [updated] = await db
      .update(users)
      .set({ locale: input.locale, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      });
    return updated;
  }),

  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const [prev] = await db
      .select({ avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, ctx.user.userId))
      .limit(1);
    const prevId = parseFileId(prev?.avatarUrl ?? null);

    const [updated] = await db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
      });

    if (prevId) {
      await db.delete(files).where(and(eq(files.id, prevId), eq(files.ownerId, ctx.user.userId)));
    }
    return updated;
  }),
});

// Recover the files.id from a /api/files/{id} URL, or null if the column
// holds something else (legacy data, manually-set value, …).
function parseFileId(value: string | null): string | null {
  if (!value) return null;
  const prefix = "/api/files/";
  if (!value.startsWith(prefix)) return null;
  const tail = value.slice(prefix.length).split("?")[0] ?? "";
  if (!tail || tail.includes("/")) return null;
  return tail;
}
