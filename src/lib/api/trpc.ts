import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { verifyAuthToken } from "../auth-server";

/**
 * 1. Context
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Extract auth token from cookies
  const cookies = opts.headers.get("cookie");
  let user: { userId?: string; userName?: string } = {};

  if (cookies) {
    const authCookie = cookies
      .split(";")
      .find((cookie) => cookie.trim().startsWith("goals-auth="));

    if (authCookie) {
      const token = authCookie.split("=")[1];
      if (token) {
        const authResult = await verifyAuthToken(token);
        if (authResult.isValid) {
          user = { userId: authResult.userId, userName: authResult.userName };
        }
      }
    }
  }

  return {
    ...opts,
    user,
  };
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
      throw new Error("Unauthorized");
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user as { userId: string; userName: string },
      },
    });
  })
);
