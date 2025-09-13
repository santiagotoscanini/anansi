import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createAuthToken, verifyAuthToken, validatePassword } from "../../auth-server";

export const authRouter = createTRPCRouter({
  authenticate: publicProcedure
    .input(
      z.object({
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const isValid = validatePassword(input.password);
      if (!isValid) return { success: false, token: null };

      const token = await createAuthToken();
      return { success: true, token };
    }),

  verify: publicProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const isValid = await verifyAuthToken(input.token);
      return { isValid };
    }),
});
