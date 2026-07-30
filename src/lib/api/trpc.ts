import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "~/lib/auth";

/**
 * 1. Context
 *
 * Auth identity is owned by Auth.js — we resolve the current session via the
 * `auth()` server helper, which decodes the JWT session cookie. The only thing
 * routers read off the context is `ctx.user.userId`.
 *
 * There used to be a `userName` field here, populated by a `SELECT name FROM
 * users` on every single request. Nothing ever read it — procedures that need
 * the profile (e.g. `auth.me`) query it themselves — so it was one wasted
 * round-trip per request. Removed.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return { ...opts, user: { userId: session?.user?.id } };
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
        user: ctx.user as { userId: string },
      },
    });
  }),
);
