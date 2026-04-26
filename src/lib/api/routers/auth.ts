import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { createAuthToken, verifyAuthToken, validatePassword, hashPassword } from "../../auth-server";
import { db } from "../../data";
import { users } from "../../data/schema";
import { and, eq, ne } from "drizzle-orm";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

export const authRouter = createTRPCRouter({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Check if email already exists
        const existingUser = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existingUser.length > 0) {
          return { success: false, error: "Email already exists" };
        }

        // Hash the password
        const hashedPassword = await hashPassword(input.password);

        // Create the user
        const newUser = await db
          .insert(users)
          .values({
            name: input.name,
            email: input.email,
            password: hashedPassword,
          })
          .returning();

        const user = newUser[0]!;
        const token = await createAuthToken(user.id, user.name);

        return { success: true, token, user: { id: user.id, name: user.name, email: user.email } };
      } catch (error) {
        console.error("Registration error:", error);
        return { success: false, error: "Registration failed" };
      }
    }),

  authenticate: publicProcedure
    .input(
      z.object({
        email: z.string().email("Invalid email address"),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Find the user by email
        const user = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (user.length === 0) {
          return { success: false, error: "Invalid credentials" };
        }

        const foundUser = user[0]!;

        // Validate password
        const isValid = await validatePassword(input.password, foundUser.password);
        if (!isValid) {
          return { success: false, error: "Invalid credentials" };
        }

        const token = await createAuthToken(foundUser.id, foundUser.name);
        return { success: true, token, user: { id: foundUser.id, name: foundUser.name, email: foundUser.email } };
      } catch (error) {
        console.error("Authentication error:", error);
        return { success: false, error: "Authentication failed" };
      }
    }),

  verify: publicProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const result = await verifyAuthToken(input.token);
      return result;
    }),

  // Authenticated profile read for the current user.
  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, ctx.user.userId))
      .limit(1);
    if (!row) throw new Error("User not found");
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
        if (existing) throw new Error("Email already in use");
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
        newPassword: z.string().min(6, "New password must be at least 6 characters"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [row] = await db.select().from(users).where(eq(users.id, ctx.user.userId)).limit(1);
      if (!row) throw new Error("User not found");
      const ok = await validatePassword(input.currentPassword, row.password);
      if (!ok) throw new Error("Current password is incorrect");
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
        fileName: z.string().min(1),
        // data: base64 with optional data: prefix
        data: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ext = (path.extname(input.fileName) || ".png").toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
        throw new Error("Unsupported image type");
      }
      const userDir = path.join(UPLOADS_ROOT, ctx.user.userId);
      if (!existsSync(userDir)) await mkdir(userDir, { recursive: true });
      const fileName = `avatar${ext}`;
      const fullPath = path.join(userDir, fileName);
      const cleanBase64 = input.data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
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
      await writeFile(fullPath, buffer);
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
