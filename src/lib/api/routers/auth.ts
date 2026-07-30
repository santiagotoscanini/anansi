// Transport only. Logic lives in src/server/services/auth.ts.
//
// Sign-in / sign-up / sign-out / password change are not here — they flow
// through Auth.js server actions in src/app/auth/actions.ts.
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import * as authService from "~/server/services/auth";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => authService.me(ctx.user.userId)),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(({ input, ctx }) => authService.updateProfile(ctx.user.userId, input)),

  uploadAvatar: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        // base64 with optional data: prefix. Size + magic bytes validated in the service.
        data: z.string().min(1),
      }),
    )
    .mutation(({ input, ctx }) => authService.uploadAvatar(ctx.user.userId, input)),

  setLocale: protectedProcedure
    .input(z.object({ locale: z.enum(["en", "es"]) }))
    .mutation(({ input, ctx }) => authService.setLocale(ctx.user.userId, input.locale)),

  removeAvatar: protectedProcedure.mutation(({ ctx }) => authService.removeAvatar(ctx.user.userId)),
});
