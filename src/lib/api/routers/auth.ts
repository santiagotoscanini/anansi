import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { db } from "../../data";
import { users } from "../../data/schema";
import { createClient } from "../../supabase/server";
import { createServiceRoleClient } from "../../supabase/service";
import { and, eq, ne } from "drizzle-orm";
import { decodeImageUpload, UploadValidationError } from "../../image-upload";
import { checkRateLimit } from "../../rate-limit";

// Avatars live in the public Supabase Storage bucket `avatars`, at the path
// `{userId}/avatar` — stable filename per user, overwritten on re-upload so
// no orphan extensions accumulate. The bucket is created (and write-RLS'd to
// the owning user) in migration 0021. Reads are unauthenticated by virtue of
// the public bucket; writes are gated by RLS using the user's session.
const AVATAR_BUCKET = "avatars";
const AVATAR_OBJECT_NAME = "avatar";

// Auth state changes (signup, signin, signout, password reset) are handled
// client-side via `supabase.auth.*` from `src/contexts/GoalsContext.tsx`.
// Cookie writes happen in middleware + the /auth/callback and /auth/confirm
// route handlers. tRPC procedures here only handle authenticated profile
// reads/writes that operate on our local `public.users` mirror.
export const authRouter = createTRPCRouter({
  // Authenticated profile read for the current user. The row is materialized
  // by the on_auth_user_created trigger on signup; if it doesn't exist yet
  // we still return 404 so the client treats it as a transient unauth.
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
      // Block email collisions with someone else's account.
      if (input.email) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, input.email), ne(users.id, ctx.user.userId)))
          .limit(1);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
      }

      // Email is owned by auth.users. We push the change through Supabase
      // first — it sends a confirmation email and only swaps the canonical
      // address once the user clicks it. We mirror the local row eagerly
      // so the UI is responsive; if the user never confirms, auth.users
      // stays on the old value and the next sign-in will resync via the
      // me query reading public.users.email. Accept that staleness in v1.
      if (input.email) {
        const supabase = await createClient();
        const { error } = await supabase.auth.updateUser({ email: input.email });
        if (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
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

  // Avatar upload — base64 image payload, written to the `avatars` Supabase
  // Storage bucket at `{userId}/avatar`. Each upload overwrites the previous
  // object (upsert) so old format leftovers don't accumulate. Returns the
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
      // Service-role storage client. RLS bypassed at the DB; the path
      // we construct uses `ctx.user.userId` which was verified by
      // `supabase.auth.getUser()` in the tRPC context, so a forged
      // userId can't reach another user's folder. See supabase/service.ts
      // for the full rationale.
      const supabase = createServiceRoleClient();
      const objectPath = `${ctx.user.userId}/${AVATAR_OBJECT_NAME}`;
      // decoded.mime is one of the four image MIME types validated by
      // decodeImageUpload (PNG/JPEG/GIF/WebP) — never null here.
      const contentType = decoded.mime ?? "application/octet-stream";
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, decoded.buffer, { contentType, upsert: true });
      if (uploadError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: uploadError.message });
      }
      const { data: publicUrl } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
      // Cache-bust on every upload — the object path is stable so without a
      // version query the CDN/browser would serve the previous bytes.
      const avatarUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
      const [updated] = await db
        .update(users)
        .set({ avatarUrl, updatedAt: new Date() })
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

  // Persist the user's UI language. The list of supported codes is enforced
  // here; the source of truth is src/i18n/config.ts → SUPPORTED_LOCALES. Keep
  // the two in sync when adding a new language. Storing a free-form string
  // (vs an enum) lets a new language ship without a DB migration — adding
  // "fr" later is one tuple entry + one JSON file.
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
    const supabase = createServiceRoleClient();
    const objectPath = `${ctx.user.userId}/${AVATAR_OBJECT_NAME}`;
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([objectPath]);
    if (removeError) {
      // Don't swallow silently — if delete fails we want to know in logs;
      // the user-facing flow still succeeds (avatarUrl is cleared in DB
      // either way) so we don't propagate the error.
      console.warn(`[auth.removeAvatar] failed to remove ${objectPath}:`, removeError.message);
    }
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
    return updated;
  }),
});
