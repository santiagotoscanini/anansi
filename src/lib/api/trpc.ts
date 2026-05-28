import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "~/lib/auth";
import { db } from "../data";
import { users } from "../data/schema";

/**
 * 1. Context
 *
 * Auth identity is owned by Auth.js — we resolve the current session via the
 * `auth()` server helper, which decodes the JWT session cookie. The shape we
 * stamp onto ctx (`{ userId, userName }`) is unchanged so the routers keep
 * reading `ctx.user.userId` exactly as before.
 *
 * `userName` is looked up from `public.users` (the local profile row). If the
 * row hasn't been materialized for some reason (race window on a brand-new
 * signup), we fall back to the session's email so the context is never
 * partially populated.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  let user: { userId?: string; userName?: string } = {};
  if (session?.user?.id) {
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.user.id)).limit(1);
    user = { userId: session.user.id, userName: row?.name ?? session.user.email ?? "" };
  }

  return { ...opts, user };
};

/**
 * 2. Initialization
 *
 * We parse ZodErrors to get typesafety on the frontend if the procedure fails due to validation errors on the backend.
 */
const trpcBuilder = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = trpcBuilder.createCallerFactory;

/**
 * 3. Router & Procedure
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = trpcBuilder.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = trpcBuilder.procedure;

/**
 * Protected (authenticated) procedure
 *
 * This is a procedure that requires a user to be authenticated.
 */
export const protectedProcedure = trpcBuilder.procedure.use(
  trpcBuilder.middleware(({ ctx, next }) => {
    if (!ctx.user.userId) {
      // Surface a real 401 to the client so React Query can distinguish
      // "session ended, redirect to login" from "server error".
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user as { userId: string; userName: string },
      },
    });
  }),
);
