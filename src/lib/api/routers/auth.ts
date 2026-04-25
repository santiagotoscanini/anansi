import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createAuthToken, verifyAuthToken, validatePassword, hashPassword } from "../../auth-server";
import { db } from "../../data";
import { users } from "../../data/schema";
import { eq } from "drizzle-orm";

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

  getUsers: publicProcedure.query(async () => {
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
