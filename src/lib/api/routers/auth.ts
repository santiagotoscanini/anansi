import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createAuthToken, verifyAuthToken, validatePassword } from "../../auth-server";
import { db } from "../../data";
import { users } from "../../data/schema";
import { eq } from "drizzle-orm";

export const authRouter = createTRPCRouter({
  authenticate: publicProcedure
    .input(
      z.object({
        password: z.string(),
        userName: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const isValid = validatePassword(input.password);
      if (!isValid) return { success: false, token: null };

      // Find the user
      const user = await db.select().from(users).where(eq(users.name, input.userName)).limit(1);
      if (user.length === 0) {
        return { success: false, token: null, error: "User not found" };
      }

      const token = await createAuthToken(user[0].id, user[0].name);
      return { success: true, token, user: user[0] };
    }),

  getUsers: publicProcedure
    .query(async () => {
      const allUsers = await db.select().from(users);
      return allUsers;
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
});
